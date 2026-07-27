import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { GameSocket, type GameSocketHandlers } from './game-socket';

type Listener = (event: { data?: unknown }) => void;

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readyState = 0;
  sent: { data: string }[] = [];
  private listeners: Record<string, Listener[]> = {};

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    (this.listeners[type] ??= []).push(listener);
  }

  send(data: string) {
    this.sent.push({ data });
  }

  close() {
    this.readyState = 3;
    this.emit('close', {});
  }

  emit(type: string, event: { data?: unknown } = {}) {
    for (const listener of this.listeners[type] ?? []) listener(event);
  }

  emitOpen() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open', {});
  }

  emitMessage(envelope: { data?: unknown; event: string }) {
    this.emit('message', { data: JSON.stringify(envelope) });
  }

  lastSent() {
    const last = this.sent.at(-1);
    return last ? (JSON.parse(last.data) as { data: unknown; event: string }) : undefined;
  }
}

function fakeHandlers(): GameSocketHandlers {
  return {
    connection: jest.fn(),
    drawOffered: jest.fn(),
    error: jest.fn(),
    finished: jest.fn(),
    move: jest.fn(),
    snapshot: jest.fn(),
  };
}

// Full, schema-valid fixtures — the real gameSnapshotEventSchema/
// moveCommittedEventSchema/drawOfferedEventSchema safeParse these at
// runtime, and GameSocket silently drops any envelope that fails
// validation (mirrors the web implementation), so an incomplete fixture
// here would make a test pass or fail for the wrong reason.
function buildGameState(overrides: Partial<Parameters<GameSocketHandlers['snapshot']>[0]> = {}) {
  return {
    activeClockStartedAt: null,
    blackClockMs: 600000,
    coachMode: false,
    currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    finishedAt: null,
    id: '99000000-0000-4000-8000-000000000001',
    players: [
      {
        avatarUrl: null,
        color: 'white' as const,
        displayName: 'Jogador Um',
        ratingBefore: 1200,
        userId: '99000000-0000-4000-8000-000000000010',
        username: 'jogador_um',
      },
      {
        avatarUrl: null,
        color: 'black' as const,
        displayName: 'Jogador Dois',
        ratingBefore: 1180,
        userId: '99000000-0000-4000-8000-000000000011',
        username: 'jogador_dois',
      },
    ],
    result: 'none' as const,
    sideToMove: 'white' as const,
    startedAt: new Date().toISOString(),
    status: 'active' as const,
    termination: 'none' as const,
    version: 3,
    whiteClockMs: 600000,
    ...overrides,
  };
}

function buildGameMove(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    clientMoveId: '99000000-0000-4000-8000-000000000020',
    color: 'white' as const,
    committedAt: new Date().toISOString(),
    fenAfter: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    flags: { capture: false, castling: null, enPassant: false, promotion: false },
    from: 'e2',
    id: 1,
    ply: 1,
    promotion: null,
    san: 'e4',
    to: 'e4',
    uci: 'e2e4',
    ...overrides,
  };
}

const gameState = buildGameState();

const clock = {
  activeClockStartedAt: null,
  blackClockMs: 600000,
  serverNow: new Date().toISOString(),
  whiteClockMs: 600000,
};

describe('GameSocket', () => {
  const originalWebSocket = global.WebSocket;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    // @ts-expect-error -- test double, not the real WebSocket implementation.
    global.WebSocket = FakeWebSocket;
  });

  afterEach(() => {
    global.WebSocket = originalWebSocket;
    jest.useRealTimers();
  });

  it('authenticates on open, then joins the game once authenticated', () => {
    const handlers = fakeHandlers();
    const socket = new GameSocket('game-1', 'token-abc', 0, handlers);
    socket.connect();

    const ws = FakeWebSocket.instances[0]!;
    ws.emitOpen();
    expect(ws.lastSent()).toEqual({
      data: { accessToken: 'token-abc', protocolVersion: 1 },
      event: 'auth.authenticate',
    });

    ws.emitMessage({ data: { protocolVersion: 1 }, event: 'auth.authenticated' });
    expect(ws.lastSent()).toEqual({
      data: { gameId: 'game-1', lastKnownVersion: 0 },
      event: 'game.join',
    });
    expect(handlers.error).not.toHaveBeenCalled();
  });

  it('surfaces a snapshot and marks the connection online', () => {
    const handlers = fakeHandlers();
    const socket = new GameSocket('game-1', 'token-abc', 0, handlers);
    socket.connect();
    const ws = FakeWebSocket.instances[0]!;
    ws.emitOpen();

    ws.emitMessage({
      data: { clock, moves: [], state: gameState },
      event: 'game.snapshot',
    });

    expect(handlers.connection).toHaveBeenCalledWith('online');
    expect(handlers.snapshot).toHaveBeenCalledWith(gameState, [], clock);
  });

  it('submitMove sends the move over the socket once open, and is a no-op otherwise', () => {
    const handlers = fakeHandlers();
    const socket = new GameSocket('game-1', 'token-abc', 5, handlers);
    socket.connect();
    const ws = FakeWebSocket.instances[0]!;

    socket.submitMove('e2e4');
    expect(ws.sent).toHaveLength(0);

    ws.emitOpen();
    socket.submitMove('e2e4');
    const sent = ws.lastSent();
    expect(sent?.event).toBe('move.submit');
    expect(sent?.data).toMatchObject({ expectedVersion: 5, gameId: 'game-1', uci: 'e2e4' });
  });

  it('calls the move handler and updates the tracked version on move_committed', () => {
    const handlers = fakeHandlers();
    const socket = new GameSocket('game-1', 'token-abc', 0, handlers);
    socket.connect();
    const ws = FakeWebSocket.instances[0]!;
    ws.emitOpen();

    const move = buildGameMove();
    const nextState = buildGameState({ version: 4 });
    ws.emitMessage({
      data: { clock, move, state: nextState },
      event: 'game.move_committed',
    });

    expect(handlers.move).toHaveBeenCalledWith(nextState, move, clock);
  });

  it('notifies drawOffered with who made the offer', () => {
    const handlers = fakeHandlers();
    const socket = new GameSocket('game-1', 'token-abc', 0, handlers);
    socket.connect();
    const ws = FakeWebSocket.instances[0]!;
    ws.emitOpen();

    ws.emitMessage({
      data: {
        clock,
        offerId: '99000000-0000-4000-8000-000000000030',
        offeredByUserId: '99000000-0000-4000-8000-000000000011',
        state: gameState,
      },
      event: 'game.draw_offered',
    });

    expect(handlers.drawOffered).toHaveBeenCalledWith(
      '99000000-0000-4000-8000-000000000030',
      '99000000-0000-4000-8000-000000000011',
      gameState,
    );
  });

  it('reconnects with backoff after an unexpected close, and stop() prevents it', () => {
    jest.useFakeTimers();
    const handlers = fakeHandlers();
    const socket = new GameSocket('game-1', 'token-abc', 0, handlers);
    socket.connect();
    expect(FakeWebSocket.instances).toHaveLength(1);

    FakeWebSocket.instances[0]!.close();
    expect(handlers.connection).toHaveBeenCalledWith('reconnecting');
    jest.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);

    socket.stop();
    expect(handlers.connection).toHaveBeenCalledWith('offline');
    FakeWebSocket.instances[1]!.close();
    jest.advanceTimersByTime(30000);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('reports a friendly error and stops when authentication yields no token', async () => {
    const handlers = fakeHandlers();
    const socket = new GameSocket('game-1', () => Promise.resolve(null), 0, handlers);
    socket.connect();
    const ws = FakeWebSocket.instances[0]!;
    ws.emitOpen();

    await Promise.resolve();
    await Promise.resolve();

    expect(handlers.error).toHaveBeenCalledWith(
      'Sua sessão expirou. Entre novamente para continuar a partida.',
    );
    expect(handlers.connection).toHaveBeenCalledWith('offline');
  });
});
