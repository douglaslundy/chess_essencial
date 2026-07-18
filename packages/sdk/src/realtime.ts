export const REALTIME_PROTOCOL_VERSION = 1 as const;

export type RealtimeConnectionState = 'connecting' | 'online' | 'reconnecting' | 'offline';

export interface RealtimeEnvelope<T = unknown> {
  data: T;
  event: string;
}

export interface RealtimeClientOptions {
  getAccessToken: () => Promise<string> | string;
  onEvent?: (message: RealtimeEnvelope) => void;
  onState?: (state: RealtimeConnectionState) => void;
  reconnectMaxDelayMs?: number;
  reconnectMinDelayMs?: number;
  url: string;
  webSocketFactory?: (url: string) => WebSocket;
}

interface JoinedGame {
  gameId: string;
  lastKnownVersion: number;
}

export class XadrezRealtimeClient {
  private attempts = 0;
  private authenticated = false;
  private readonly games = new Map<string, JoinedGame>();
  private readonly options: RealtimeClientOptions;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private socket: WebSocket | undefined;
  private stopped = true;

  constructor(options: RealtimeClientOptions) {
    this.options = options;
  }

  connect() {
    if (!this.stopped && this.socket) return;
    this.stopped = false;
    this.open();
  }

  disconnect() {
    this.stopped = true;
    this.authenticated = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.socket?.close(1000, 'Client disconnect');
    this.socket = undefined;
    this.options.onState?.('offline');
  }

  joinGame(gameId: string, lastKnownVersion = 0) {
    this.games.set(gameId, { gameId, lastKnownVersion });
    if (this.authenticated && this.socket?.readyState === 1) {
      this.send('game.join', { gameId, lastKnownVersion });
    }
  }

  submitMove(input: {
    clientMoveId: string;
    expectedVersion: number;
    gameId: string;
    uci: string;
  }) {
    this.send('move.submit', input);
  }

  private open() {
    this.authenticated = false;
    this.options.onState?.(this.attempts === 0 ? 'connecting' : 'reconnecting');
    const factory = this.options.webSocketFactory ?? ((url: string) => new WebSocket(url));
    const socket = factory(this.options.url);
    this.socket = socket;

    socket.onopen = () => {
      void this.authenticate(socket);
    };
    socket.onmessage = (event) => this.receive(event.data);
    socket.onclose = () => {
      this.authenticated = false;
      if (this.socket === socket) this.socket = undefined;
      if (!this.stopped) this.scheduleReconnect();
    };
    socket.onerror = () => socket.close();
  }

  private async authenticate(socket: WebSocket) {
    try {
      const accessToken = await this.options.getAccessToken();
      if (this.socket !== socket || socket.readyState !== 1) return;
      socket.send(
        JSON.stringify({
          data: { accessToken, protocolVersion: REALTIME_PROTOCOL_VERSION },
          event: 'auth.authenticate',
        }),
      );
    } catch {
      socket.close(4401, 'Access token unavailable');
    }
  }

  private receive(raw: unknown) {
    if (typeof raw !== 'string') return;
    let message: RealtimeEnvelope;
    try {
      message = JSON.parse(raw) as RealtimeEnvelope;
    } catch {
      return;
    }

    if (message.event === 'auth.authenticated') {
      this.authenticated = true;
      this.attempts = 0;
      this.options.onState?.('online');
      for (const game of this.games.values()) this.send('game.join', game);
    }
    if (
      (message.event === 'game.snapshot' || message.event === 'game.move_committed') &&
      message.data &&
      typeof message.data === 'object' &&
      'state' in message.data
    ) {
      const state = (message.data as { state?: { id?: unknown; version?: unknown } }).state;
      if (typeof state?.id === 'string' && typeof state.version === 'number') {
        const game = this.games.get(state.id);
        if (game) game.lastKnownVersion = Math.max(game.lastKnownVersion, state.version);
      }
    }
    this.options.onEvent?.(message);
  }

  private scheduleReconnect() {
    this.attempts += 1;
    this.options.onState?.('reconnecting');
    const minimum = this.options.reconnectMinDelayMs ?? 250;
    const maximum = this.options.reconnectMaxDelayMs ?? 10_000;
    const delay = Math.min(maximum, minimum * 2 ** Math.min(this.attempts - 1, 6));
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  private send(event: string, data: unknown) {
    if (!this.authenticated || this.socket?.readyState !== 1) {
      throw new Error('Realtime socket is not authenticated');
    }
    this.socket.send(JSON.stringify({ data, event }));
  }
}
