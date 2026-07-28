import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GamesGateway } from './games.gateway.js';

interface FakeSocket {
  readyState: number;
  OPEN: number;
  send: (data: string) => void;
  sent: string[];
}

function fakeSocket(): FakeSocket {
  const sent: string[] = [];
  return {
    OPEN: 1,
    readyState: 1,
    send: (data: string) => sent.push(data),
    sent,
  };
}

function parseSent(socket: FakeSocket) {
  return socket.sent.map((raw) => JSON.parse(raw) as { data: unknown; event: string });
}

function fakeRedisService() {
  const publish = vi.fn().mockResolvedValue(1);
  return {
    client: {
      duplicate: () => ({
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn(),
        on: vi.fn(),
        quit: vi.fn().mockResolvedValue('OK'),
        subscribe: vi.fn().mockResolvedValue(undefined),
      }),
      publish,
      status: 'ready',
    },
  };
}

describe('GamesGateway bot reply delay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('broadcasts the player move immediately and the bot move ~1s later', async () => {
    const gameId = '22222222-2222-4222-8222-222222222222';
    const playerState = {
      activeClockStartedAt: null,
      blackClockMs: 60000,
      currentFen: 'startpos',
      finishedAt: null,
      id: gameId,
      players: [],
      result: 'none',
      sideToMove: 'black',
      startedAt: null,
      status: 'active',
      termination: 'none',
      version: 1,
      whiteClockMs: 60000,
    };
    const botState = { ...playerState, sideToMove: 'white', version: 2 };
    const auth = { verifyAccessToken: vi.fn().mockResolvedValue({ userId: 'user-1' }) };
    const games = {
      commitBotMoveIfNeeded: vi.fn().mockResolvedValue({
        move: { id: 2, uci: 'e7e5' },
        state: botState,
      }),
      commitPlayerMove: vi.fn().mockResolvedValue({
        move: { id: 1, uci: 'e2e4' },
        state: playerState,
      }),
      realtimeSnapshot: vi.fn().mockResolvedValue({ moves: [], state: playerState }),
      setConnection: vi.fn().mockResolvedValue(undefined),
    };
    const metrics = { increment: vi.fn() };
    const redis = fakeRedisService();
    const gateway = new GamesGateway(
      auth as never,
      games as never,
      metrics as never,
      redis as never,
    );

    const socket = fakeSocket();
    gateway.handleConnection(socket as never);
    await gateway.authenticate(socket as never, { accessToken: 'token', protocolVersion: 1 });
    await gateway.join(socket as never, { gameId, lastKnownVersion: 0 });
    await gateway.submitMove(socket as never, {
      clientMoveId: '11111111-1111-4111-8111-111111111111',
      expectedVersion: 0,
      gameId,
      uci: 'e2e4',
    });

    const beforeDelay = parseSent(socket).filter((m) => m.event === 'game.move_committed');
    expect(beforeDelay).toHaveLength(1);
    expect(games.commitBotMoveIfNeeded).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    const afterDelay = parseSent(socket).filter((m) => m.event === 'game.move_committed');
    expect(afterDelay).toHaveLength(2);
    expect(games.commitBotMoveIfNeeded).toHaveBeenCalledWith(gameId);
  });

  it('logs and records a metric, without crashing or notifying the client, when the delayed bot commit fails', async () => {
    const gameId = '33333333-3333-4333-8333-333333333333';
    const playerState = {
      activeClockStartedAt: null,
      blackClockMs: 60000,
      currentFen: 'startpos',
      finishedAt: null,
      id: gameId,
      players: [],
      result: 'none',
      sideToMove: 'black',
      startedAt: null,
      status: 'active',
      termination: 'none',
      version: 1,
      whiteClockMs: 60000,
    };
    const auth = { verifyAccessToken: vi.fn().mockResolvedValue({ userId: 'user-1' }) };
    const games = {
      commitBotMoveIfNeeded: vi.fn().mockRejectedValue(new Error('db exploded')),
      commitPlayerMove: vi.fn().mockResolvedValue({
        move: { id: 1, uci: 'e2e4' },
        state: playerState,
      }),
      realtimeSnapshot: vi.fn().mockResolvedValue({ moves: [], state: playerState }),
      setConnection: vi.fn().mockResolvedValue(undefined),
    };
    const metrics = { increment: vi.fn() };
    const redis = fakeRedisService();
    const gateway = new GamesGateway(
      auth as never,
      games as never,
      metrics as never,
      redis as never,
    );

    const socket = fakeSocket();
    gateway.handleConnection(socket as never);
    await gateway.authenticate(socket as never, { accessToken: 'token', protocolVersion: 1 });
    await gateway.join(socket as never, { gameId, lastKnownVersion: 0 });
    await gateway.submitMove(socket as never, {
      clientMoveId: '11111111-1111-4111-8111-111111111111',
      expectedVersion: 0,
      gameId,
      uci: 'e2e4',
    });

    await vi.advanceTimersByTimeAsync(1000);

    expect(games.commitBotMoveIfNeeded).toHaveBeenCalledWith(gameId);
    const sent = parseSent(socket);
    expect(sent.filter((m) => m.event === 'game.move_committed')).toHaveLength(1);
    expect(sent.filter((m) => m.event === 'game.error')).toHaveLength(0);
    expect(metrics.increment).toHaveBeenCalledWith('xadrez_ws_bot_reply_failures_total');
  });
});
