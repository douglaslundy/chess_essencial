import {
  REALTIME_PROTOCOL_VERSION,
  authenticateCommandSchema,
  gameJoinCommandSchema,
  realtimeMoveSubmitSchema,
  type GameState,
} from '@xadrez/contracts';
import {
  HttpException,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';

import { AuthService } from '../../auth/auth.service.js';
import { MetricsService } from '../../observability/metrics.service.js';
import { RedisService } from '../../redis/redis.service.js';
import { GamesService } from '../application/games.service.js';

// The API runs multiple instances behind a load balancer, so two players in
// the same game can end up connected to different processes. clientsByGame
// only ever reaches WebSocket clients local to *this* process — every
// broadcast still delivers to this instance's own clients immediately
// (unchanged), and is *also* published on this Redis channel so every other
// instance relays it to its own locally-connected clients. Each message
// carries the publishing instance's id purely so that instance can ignore
// its own echo coming back through the subscription (it already delivered
// locally) instead of sending every event to its clients twice.
const GAME_EVENTS_CHANNEL = 'xadrez:game-events';

interface GameEventMessage {
  data: unknown;
  event: string;
  gameId: string;
  originInstanceId: string;
}

interface ClientSession {
  authenticationTimer: NodeJS.Timeout;
  gameIds: Set<string>;
  userId: string | null;
  commandCount: number;
  commandWindowStartedAt: number;
  rateLimitViolations: number;
}

@WebSocketGateway({ path: '/v1/ws', maxPayload: 16 * 1024 })
export class GamesGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(GamesGateway.name);
  private readonly clientsByGame = new Map<string, Set<WebSocket>>();
  private readonly sessions = new Map<WebSocket, ClientSession>();
  private readonly timeoutTimers = new Map<string, NodeJS.Timeout>();
  private readonly subscriber: Redis;
  private readonly instanceId = randomUUID();

  constructor(
    private readonly auth: AuthService,
    private readonly games: GamesService,
    private readonly metrics: MetricsService,
    private readonly redis: RedisService,
  ) {
    // A connection in subscribe mode can't issue other Redis commands, so
    // publishing (this.redis.client) and subscribing need separate connections.
    this.subscriber = this.redis.client.duplicate();
  }

  async onModuleInit() {
    // This hook runs on every boot of the app, including in test suites
    // with no real Redis available - never let it take app.init() down
    // with it. Without cross-instance relay, live games still work exactly
    // as before for any client connected to the same process (broadcast()
    // always delivers locally first, regardless of this subscription).
    this.subscriber.on('error', (error: Error) => {
      this.logger.error('Game events Redis subscriber connection error', error.stack);
    });
    try {
      await this.subscriber.subscribe(GAME_EVENTS_CHANNEL);
    } catch (error) {
      this.logger.error(
        'Failed to subscribe to the game events Redis channel; cross-instance realtime relay is disabled',
        error instanceof Error ? error.stack : undefined,
      );
      return;
    }
    this.subscriber.on('message', (channel: string, message: string) => {
      if (channel !== GAME_EVENTS_CHANNEL) return;
      try {
        const payload = JSON.parse(message) as GameEventMessage;
        if (payload.originInstanceId === this.instanceId) return; // Already delivered locally by broadcast().
        this.broadcastLocal(payload.gameId, payload.event, payload.data);
      } catch (error) {
        this.logger.error(
          'Failed to process a game event received from Redis',
          error instanceof Error ? error.stack : undefined,
        );
      }
    });
  }

  handleConnection(client: WebSocket) {
    if (this.sessions.size >= 1_000) {
      client.close(1013, 'Server connection limit reached');
      this.metrics.increment('xadrez_ws_connection_rejections_total');
      return;
    }
    const authenticationTimer = setTimeout(() => {
      if (!this.sessions.get(client)?.userId) client.close(4401, 'Authentication required');
    }, 5_000);
    authenticationTimer.unref();
    this.sessions.set(client, {
      authenticationTimer,
      gameIds: new Set(),
      userId: null,
      commandCount: 0,
      commandWindowStartedAt: Date.now(),
      rateLimitViolations: 0,
    });
  }

  async onModuleDestroy() {
    for (const timer of this.timeoutTimers.values()) clearTimeout(timer);
    try {
      await this.subscriber.quit();
    } catch {
      // Nothing meaningful to do with a failed disconnect during shutdown.
    }
  }

  handleDisconnect(client: WebSocket) {
    const session = this.sessions.get(client);
    if (!session) return;
    clearTimeout(session.authenticationTimer);
    for (const gameId of session.gameIds) {
      this.clientsByGame.get(gameId)?.delete(client);
      if (session.userId) void this.games.setConnection(gameId, session.userId, false);
    }
    this.sessions.delete(client);
  }

  @SubscribeMessage('auth.authenticate')
  async authenticate(@ConnectedSocket() client: WebSocket, @MessageBody() body: unknown) {
    try {
      this.consumeCommand(client, 'auth.authenticate');
      const command = authenticateCommandSchema.parse(body);
      const session = this.session(client);
      const user = await this.auth.verifyAccessToken(command.accessToken);
      session.userId = user.userId;
      clearTimeout(session.authenticationTimer);
      this.send(client, 'auth.authenticated', {
        protocolVersion: REALTIME_PROTOCOL_VERSION,
      });
    } catch (error) {
      this.fail(client, 'auth.authenticate', error);
    }
  }

  @SubscribeMessage('game.join')
  async join(@ConnectedSocket() client: WebSocket, @MessageBody() body: unknown) {
    try {
      this.consumeCommand(client, 'game.join');
      const command = gameJoinCommandSchema.parse(body);
      const userId = this.authenticatedUserId(client);
      const snapshot = await this.games.realtimeSnapshot(
        command.gameId,
        userId,
        command.lastKnownVersion,
      );
      this.joinRoom(client, command.gameId);
      await this.games.setConnection(command.gameId, userId, true);
      this.send(client, 'game.snapshot', {
        clock: this.clock(snapshot.state),
        ...snapshot,
      });
      this.scheduleTimeout(command.gameId, snapshot.state);
    } catch (error) {
      this.fail(client, 'game.join', error);
    }
  }

  private static readonly BOT_REPLY_DELAY_MS = 1000;

  @SubscribeMessage('move.submit')
  async submitMove(@ConnectedSocket() client: WebSocket, @MessageBody() body: unknown) {
    try {
      this.consumeCommand(client, 'move.submit');
      const command = realtimeMoveSubmitSchema.parse(body);
      const userId = this.authenticatedUserId(client);
      if (!this.session(client).gameIds.has(command.gameId)) {
        throw new UnauthorizedException('Join the game before submitting a move');
      }
      const result = await this.games.commitPlayerMove(command.gameId, userId, command);
      this.broadcast(command.gameId, 'game.move_committed', {
        clock: this.clock(result.state),
        ...result,
      });
      this.scheduleTimeout(command.gameId, result.state);
      this.scheduleBotReply(command.gameId);
    } catch (error) {
      this.fail(client, 'move.submit', error);
    }
  }

  private scheduleBotReply(gameId: string) {
    const timer = setTimeout(() => {
      void this.games
        .commitBotMoveIfNeeded(gameId)
        .then((bot) => {
          if (!bot) return;
          this.broadcast(gameId, 'game.move_committed', {
            clock: this.clock(bot.state),
            ...bot,
          });
          this.scheduleTimeout(gameId, bot.state);
        })
        .catch((error: unknown) => {
          // No client request is pending on this delayed callback, so failures here
          // (e.g. the game finished by resignation during the delay, or a genuine
          // DB/engine error) cannot be reported to a waiting client. Log and record
          // a metric so real failures remain observable instead of silent.
          this.logger.error(
            'Failed to commit delayed bot reply',
            error instanceof Error ? error.stack : undefined,
          );
          this.metrics.increment('xadrez_ws_bot_reply_failures_total');
        });
    }, GamesGateway.BOT_REPLY_DELAY_MS);
    timer.unref();
  }

  notifyFinished(gameId: string, state: GameState) {
    this.broadcast(gameId, 'game.finished', {
      clock: this.clock(state),
      state,
    });
  }

  notifyDrawOffered(gameId: string, offerId: string, offeredByUserId: string, state: GameState) {
    this.broadcast(gameId, 'game.draw_offered', {
      clock: this.clock(state),
      offerId,
      offeredByUserId,
      state,
    });
  }

  private authenticatedUserId(client: WebSocket) {
    const userId = this.session(client).userId;
    if (!userId) throw new UnauthorizedException('WebSocket is not authenticated');
    return userId;
  }

  /**
   * Delivers to this instance's own locally-connected clients immediately
   * (unchanged from before), and also publishes to Redis so every *other*
   * API instance relays it to its own clients. See GAME_EVENTS_CHANNEL.
   */
  private broadcast(gameId: string, event: string, data: unknown) {
    this.broadcastLocal(gameId, event, data);
    const payload: GameEventMessage = { data, event, gameId, originInstanceId: this.instanceId };
    this.redis.client
      .publish(GAME_EVENTS_CHANNEL, JSON.stringify(payload))
      .catch((error: unknown) => {
        // Local clients already got it above; only clients on other instances
        // are affected by Redis being briefly unavailable.
        this.logger.error(
          'Failed to publish a game event to Redis; other instances will not relay it',
          error instanceof Error ? error.stack : undefined,
        );
      });
  }

  private broadcastLocal(gameId: string, event: string, data: unknown) {
    for (const client of this.clientsByGame.get(gameId) ?? []) {
      this.send(client, event, data);
    }
  }

  private clock(state: GameState) {
    return {
      activeClockStartedAt: state.activeClockStartedAt,
      blackClockMs: state.blackClockMs,
      serverNow: new Date().toISOString(),
      whiteClockMs: state.whiteClockMs,
    };
  }

  private fail(client: WebSocket, event: string, error: unknown) {
    const status = error instanceof HttpException ? error.getStatus() : 400;
    const response = error instanceof HttpException ? error.getResponse() : null;
    const detail =
      typeof response === 'string'
        ? response
        : response && typeof response === 'object' && 'message' in response
          ? String(response.message)
          : 'Invalid realtime command';
    this.send(client, 'game.error', { detail, event, status });
  }

  private joinRoom(client: WebSocket, gameId: string) {
    const session = this.session(client);
    if (!session.gameIds.has(gameId) && session.gameIds.size >= 16) {
      throw new HttpException('WebSocket room limit exceeded', 429);
    }
    session.gameIds.add(gameId);
    const room = this.clientsByGame.get(gameId) ?? new Set<WebSocket>();
    room.add(client);
    this.clientsByGame.set(gameId, room);
  }

  private scheduleTimeout(gameId: string, state: GameState) {
    const current = this.timeoutTimers.get(gameId);
    if (current) clearTimeout(current);
    this.timeoutTimers.delete(gameId);
    if (state.status !== 'active' || !state.activeClockStartedAt) return;

    const storedClockMs = state.sideToMove === 'white' ? state.whiteClockMs : state.blackClockMs;
    const elapsedMs = Math.max(0, Date.now() - new Date(state.activeClockStartedAt).getTime());
    const timer = setTimeout(
      async () => {
        try {
          const finished = await this.games.expireOnTime(gameId);
          if (!finished) return;
          this.timeoutTimers.delete(gameId);
          this.broadcast(gameId, 'game.finished', {
            clock: this.clock(finished),
            state: finished,
          });
        } catch {
          this.timeoutTimers.delete(gameId);
        }
      },
      Math.max(1, storedClockMs - elapsedMs + 25),
    );
    timer.unref();
    this.timeoutTimers.set(gameId, timer);
  }

  private consumeCommand(client: WebSocket, event: string) {
    const session = this.session(client);
    const now = Date.now();
    if (now - session.commandWindowStartedAt >= 10_000) {
      session.commandWindowStartedAt = now;
      session.commandCount = 0;
      session.rateLimitViolations = 0;
    }
    session.commandCount += 1;
    this.metrics.increment('xadrez_ws_commands_total', { event });
    if (session.commandCount <= 30) return;
    session.rateLimitViolations += 1;
    this.metrics.increment('xadrez_ws_rate_limit_rejections_total', { event });
    if (session.rateLimitViolations >= 3) client.close(4429, 'Rate limit exceeded');
    throw new HttpException('WebSocket command rate limit exceeded', 429);
  }

  private send(client: WebSocket, event: string, data: unknown) {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify({ data, event }));
    }
  }

  private session(client: WebSocket) {
    const session = this.sessions.get(client);
    if (!session) throw new UnauthorizedException('Unknown WebSocket connection');
    return session;
  }
}
