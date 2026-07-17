import {
  REALTIME_PROTOCOL_VERSION,
  authenticateCommandSchema,
  gameJoinCommandSchema,
  realtimeMoveSubmitSchema,
  type GameState,
} from '@xadrez/contracts';
import { HttpException, OnModuleDestroy, UnauthorizedException } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { WebSocket } from 'ws';

import { AuthService } from '../../auth/auth.service.js';
import { GamesService } from '../application/games.service.js';

interface ClientSession {
  authenticationTimer: NodeJS.Timeout;
  gameIds: Set<string>;
  userId: string | null;
}

@WebSocketGateway({ path: '/v1/ws' })
export class GamesGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  private readonly clientsByGame = new Map<string, Set<WebSocket>>();
  private readonly sessions = new Map<WebSocket, ClientSession>();
  private readonly timeoutTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly auth: AuthService,
    private readonly games: GamesService,
  ) {}

  handleConnection(client: WebSocket) {
    const authenticationTimer = setTimeout(() => {
      if (!this.sessions.get(client)?.userId) client.close(4401, 'Authentication required');
    }, 5_000);
    authenticationTimer.unref();
    this.sessions.set(client, {
      authenticationTimer,
      gameIds: new Set(),
      userId: null,
    });
  }

  onModuleDestroy() {
    for (const timer of this.timeoutTimers.values()) clearTimeout(timer);
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

  @SubscribeMessage('move.submit')
  async submitMove(@ConnectedSocket() client: WebSocket, @MessageBody() body: unknown) {
    try {
      const command = realtimeMoveSubmitSchema.parse(body);
      const userId = this.authenticatedUserId(client);
      if (!this.session(client).gameIds.has(command.gameId)) {
        throw new UnauthorizedException('Join the game before submitting a move');
      }
      const result = await this.games.commitMove(command.gameId, userId, command);
      this.broadcast(command.gameId, 'game.move_committed', {
        clock: this.clock(result.state),
        ...result,
      });
      this.scheduleTimeout(command.gameId, result.state);
    } catch (error) {
      this.fail(client, 'move.submit', error);
    }
  }

  private authenticatedUserId(client: WebSocket) {
    const userId = this.session(client).userId;
    if (!userId) throw new UnauthorizedException('WebSocket is not authenticated');
    return userId;
  }

  private broadcast(gameId: string, event: string, data: unknown) {
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
