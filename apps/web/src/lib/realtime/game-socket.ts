import {
  authenticatedEventSchema,
  clockUpdatedEventSchema,
  drawOfferedEventSchema,
  gameSnapshotEventSchema,
  moveCommittedEventSchema,
  realtimeProblemSchema,
  REALTIME_PROTOCOL_VERSION,
  type GameMove,
  type GameState,
  type RealtimeClock,
} from '@xadrez/contracts';

import { webEnv } from '@/env';
import { randomUUID } from '@/lib/uuid';

type ConnectionState = 'connecting' | 'online' | 'reconnecting' | 'offline';

export interface GameSocketHandlers {
  connection: (state: ConnectionState) => void;
  drawOffered: (offerId: string, offeredByUserId: string, state: GameState) => void;
  snapshot: (state: GameState, moves: GameMove[], clock: RealtimeClock) => void;
  move: (state: GameState, move: GameMove, clock: RealtimeClock) => void;
  finished: (state: GameState, clock: RealtimeClock) => void;
  /** The clock changed without a move (a capture film holds or releases it). */
  clock?: (state: GameState, clock: RealtimeClock) => void;
  error: (message: string) => void;
}

export function realtimeUrl(apiUrl = webEnv.NEXT_PUBLIC_API_URL) {
  return `${apiUrl.replace(/^http/, 'ws').replace(/\/$/, '')}/ws`;
}

type AccessTokenProvider = string | ((forceRefresh?: boolean) => Promise<string | null>);

export class GameSocket {
  private socket?: WebSocket;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private attempts = 0;
  private forceTokenRefresh = false;
  private version: number;

  constructor(
    private readonly gameId: string,
    private readonly tokenProvider: AccessTokenProvider,
    lastKnownVersion: number,
    private readonly handlers: GameSocketHandlers,
  ) {
    this.version = lastKnownVersion;
  }

  connect() {
    this.stopped = false;
    this.handlers.connection(this.attempts ? 'reconnecting' : 'connecting');
    const socket = new WebSocket(realtimeUrl());
    this.socket = socket;
    socket.addEventListener('open', () => {
      void this.authenticate(socket);
    });
    socket.addEventListener('message', (event) => this.receive(String(event.data)));
    socket.addEventListener('close', () => this.retry());
    socket.addEventListener('error', () => socket.close());
  }

  submitMove(uci: string) {
    this.send('move.submit', {
      gameId: this.gameId,
      clientMoveId: randomUUID(),
      expectedVersion: this.version,
      uci,
    });
  }

  /** Tells the server this player's capture film started (`playing`) or is over. */
  captureFilm(ply: number, playing: boolean) {
    this.send('game.capture_film', { gameId: this.gameId, playing, ply });
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.handlers.connection('offline');
  }

  private send(event: string, data: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ event, data }));
    }
  }

  private async authenticate(socket: WebSocket) {
    try {
      const forceRefresh = this.forceTokenRefresh;
      this.forceTokenRefresh = false;
      const token =
        typeof this.tokenProvider === 'string'
          ? this.tokenProvider
          : await this.tokenProvider(forceRefresh);
      if (this.stopped || socket !== this.socket) return;
      if (!token) {
        this.stopped = true;
        this.handlers.connection('offline');
        this.handlers.error('Sua sessão expirou. Entre novamente para continuar a partida.');
        socket.close();
        return;
      }
      this.send('auth.authenticate', {
        protocolVersion: REALTIME_PROTOCOL_VERSION,
        accessToken: token,
      });
    } catch {
      this.stopped = true;
      this.handlers.connection('offline');
      this.handlers.error('Não foi possível renovar sua sessão da partida.');
      socket.close();
    }
  }

  private receive(raw: string) {
    let envelope: { event?: string; data?: unknown };
    try {
      envelope = JSON.parse(raw) as { event?: string; data?: unknown };
    } catch {
      this.handlers.error('O servidor enviou uma mensagem inválida.');
      return;
    }
    if (envelope.event === 'auth.authenticated') {
      const parsed = authenticatedEventSchema.safeParse(envelope.data);
      if (!parsed.success) {
        this.handlers.error('O servidor não confirmou a autenticação em tempo real.');
        this.socket?.close();
        return;
      }
      this.send('game.join', { gameId: this.gameId, lastKnownVersion: this.version });
      return;
    }
    if (envelope.event === 'game.snapshot') {
      const parsed = gameSnapshotEventSchema.safeParse(envelope.data);
      if (parsed.success) {
        this.attempts = 0;
        this.version = parsed.data.state.version;
        this.handlers.connection('online');
        this.handlers.snapshot(parsed.data.state, parsed.data.moves, parsed.data.clock);
      }
      return;
    }
    if (envelope.event === 'game.move_committed') {
      const parsed = moveCommittedEventSchema.safeParse(envelope.data);
      if (parsed.success) {
        this.version = parsed.data.state.version;
        this.handlers.move(parsed.data.state, parsed.data.move, parsed.data.clock);
      }
      return;
    }
    if (envelope.event === 'game.clock_updated') {
      const parsed = clockUpdatedEventSchema.safeParse(envelope.data);
      if (parsed.success) this.handlers.clock?.(parsed.data.state, parsed.data.clock);
      return;
    }
    if (envelope.event === 'game.draw_offered') {
      const parsed = drawOfferedEventSchema.safeParse(envelope.data);
      if (parsed.success) {
        this.version = parsed.data.state.version;
        this.handlers.drawOffered(
          parsed.data.offerId,
          parsed.data.offeredByUserId,
          parsed.data.state,
        );
      }
      return;
    }
    if (envelope.event === 'game.finished') {
      const parsed = gameSnapshotEventSchema
        .pick({ state: true, clock: true })
        .safeParse(envelope.data);
      if (parsed.success) {
        this.version = parsed.data.state.version;
        this.handlers.finished(parsed.data.state, parsed.data.clock);
      }
      return;
    }
    if (envelope.event === 'game.error') {
      const parsed = realtimeProblemSchema.safeParse(envelope.data);
      this.handlers.error(parsed.success ? parsed.data.detail : 'O servidor recusou a operação.');
      if (
        parsed.success &&
        parsed.data.status === 401 &&
        parsed.data.event === 'auth.authenticate'
      ) {
        this.forceTokenRefresh = true;
        this.socket?.close();
      }
    }
  }

  private retry() {
    if (this.stopped) return;
    this.handlers.connection('reconnecting');
    const delay = Math.min(1000 * 2 ** this.attempts++, 15000);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}
