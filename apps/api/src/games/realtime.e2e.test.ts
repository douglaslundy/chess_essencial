import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

import { createApp } from '../bootstrap.js';
import { DatabaseService } from '../database/database.service.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

interface Identity {
  accessToken: string;
  userId: string;
}

interface MessageEnvelope {
  data: {
    clock: { activeClockStartedAt: string | null; serverNow: string };
    move: { clientMoveId: string; id: number };
    offerId: string;
    offeredByUserId: string;
    moves: Array<{ uci: string }>;
    state: {
      result: string;
      status: string;
      termination: string;
      version: number;
      whiteClockMs: number;
      pendingDrawOffer: { offerId: string; offeredByUserId: string; createdAt: string } | null;
    };
  };
  event: string;
}

describeDatabase('realtime game integration', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let baseUrl = '';
  const sockets: WebSocket[] = [];
  let white: Identity;
  let black: Identity;

  beforeAll(async () => {
    app = await createApp();
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') throw new Error('Test server address unavailable');
    baseUrl = `ws://127.0.0.1:${address.port}/v1/ws`;
    white = await createIdentity('rt-white@example.com', 'rt_white');
    black = await createIdentity('rt-black@example.com', 'rt_black');
  });

  afterAll(async () => {
    for (const socket of sockets) socket.close();
    await app.close();
  });

  async function createIdentity(email: string, username: string): Promise<Identity> {
    const registration = await app.inject({
      method: 'POST',
      payload: {
        displayName: username,
        email,
        password: 'realtime integration password 2026',
        username,
      },
      url: '/v1/auth/register',
    });
    expect(registration.statusCode, registration.body).toBe(201);
    const registered = registration.json();
    await app.inject({
      method: 'POST',
      payload: { token: registered.verificationToken },
      url: '/v1/auth/verify',
    });
    const login = await app.inject({
      method: 'POST',
      payload: { identifier: email, password: 'realtime integration password 2026' },
      url: '/v1/auth/login',
    });
    expect(login.statusCode, login.body).toBe(200);
    return { accessToken: login.json().tokens.accessToken, userId: registered.user.id };
  }

  async function connect(identity: Identity) {
    const socket = new WebSocket(baseUrl);
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    const authenticated = waitFor(socket, 'auth.authenticated');
    send(socket, 'auth.authenticate', {
      accessToken: identity.accessToken,
      protocolVersion: 1,
    });
    await authenticated;
    return socket;
  }

  function send(socket: WebSocket, event: string, data: unknown) {
    socket.send(JSON.stringify({ data, event }));
  }

  function waitFor(
    socket: WebSocket,
    event: string,
    predicate: (message: MessageEnvelope) => boolean = () => true,
  ) {
    return new Promise<MessageEnvelope>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), 5_000);
      socket.on('message', function listener(raw) {
        const message = JSON.parse(raw.toString()) as MessageEnvelope;
        if (message.event !== event || !predicate(message)) return;
        clearTimeout(timeout);
        socket.off('message', listener);
        resolve(message);
      });
    });
  }

  async function submit(
    socket: WebSocket,
    gameId: string,
    clientMoveId: string,
    expectedVersion: number,
    uci: string,
  ) {
    const committed = waitFor(
      socket,
      'game.move_committed',
      (message) => message.data.move.clientMoveId === clientMoveId,
    );
    send(socket, 'move.submit', { clientMoveId, expectedVersion, gameId, uci });
    return (await committed).data;
  }

  it('plays a complete game, deduplicates a command and reconnects from a version', async () => {
    const created = await app.inject({
      headers: { authorization: `Bearer ${white.accessToken}` },
      method: 'POST',
      payload: {
        creatorColor: 'white',
        opponentUserId: black.userId,
        timeControlCode: 'blitz-3-0',
      },
      url: '/v1/games',
    });
    expect(created.statusCode, created.body).toBe(201);
    const gameId = created.json().id as string;

    const whiteSocket = await connect(white);
    let blackSocket = await connect(black);

    const whiteSnapshot = waitFor(whiteSocket, 'game.snapshot');
    send(whiteSocket, 'game.join', { gameId, lastKnownVersion: 0 });
    expect((await whiteSnapshot).data.state.version).toBe(0);

    const blackSnapshot = waitFor(blackSocket, 'game.snapshot');
    send(blackSocket, 'game.join', { gameId, lastKnownVersion: 0 });
    await blackSnapshot;

    const firstId = '018f47f4-7b2f-4d90-8a66-b00000000001';
    const first = await submit(whiteSocket, gameId, firstId, 0, 'f2f3');
    expect(first.state.version).toBe(1);
    expect(first.state.whiteClockMs).toBeLessThan(180_000);

    const duplicate = await submit(whiteSocket, gameId, firstId, 0, 'f2f3');
    expect(duplicate.move.id).toBe(first.move.id);
    expect(duplicate.state.version).toBe(1);

    await submit(blackSocket, gameId, '018f47f4-7b2f-4d90-8a66-b00000000002', 1, 'e7e5');
    await submit(whiteSocket, gameId, '018f47f4-7b2f-4d90-8a66-b00000000003', 2, 'g2g4');

    blackSocket.close();
    blackSocket = await connect(black);
    const reconnected = waitFor(blackSocket, 'game.snapshot');
    send(blackSocket, 'game.join', { gameId, lastKnownVersion: 2 });
    const reconnectSnapshot = (await reconnected).data;
    expect(reconnectSnapshot.state.version).toBe(3);
    expect(reconnectSnapshot.moves.map((move: { uci: string }) => move.uci)).toEqual(['g2g4']);

    const mate = await submit(
      blackSocket,
      gameId,
      '018f47f4-7b2f-4d90-8a66-b00000000004',
      3,
      'd8h4',
    );
    expect(mate.state).toMatchObject({
      result: 'black_win',
      status: 'finished',
      termination: 'checkmate',
      version: 4,
    });

    const moves = await app.inject({
      headers: { authorization: `Bearer ${white.accessToken}` },
      method: 'GET',
      url: `/v1/games/${gameId}/moves`,
    });
    expect(moves.json()).toHaveLength(4);
  }, 20_000);
  it('broadcasts draw offers and agreement to both players', async () => {
    const created = await app.inject({
      headers: { authorization: `Bearer ${white.accessToken}` },
      method: 'POST',
      payload: {
        creatorColor: 'white',
        opponentUserId: black.userId,
        timeControlCode: 'blitz-3-0',
      },
      url: '/v1/games',
    });
    expect(created.statusCode, created.body).toBe(201);
    const gameId = created.json().id as string;
    const whiteSocket = await connect(white);
    const blackSocket = await connect(black);

    const whiteSnapshot = waitFor(whiteSocket, 'game.snapshot');
    send(whiteSocket, 'game.join', { gameId, lastKnownVersion: 0 });
    await whiteSnapshot;
    const blackSnapshot = waitFor(blackSocket, 'game.snapshot');
    send(blackSocket, 'game.join', { gameId, lastKnownVersion: 0 });
    await blackSnapshot;

    const offeredEvent = waitFor(blackSocket, 'game.draw_offered');
    const offered = await app.inject({
      headers: { authorization: `Bearer ${white.accessToken}` },
      method: 'POST',
      url: `/v1/games/${gameId}/draw-offers`,
    });
    expect(offered.statusCode, offered.body).toBe(201);
    expect((await offeredEvent).data).toMatchObject({
      offerId: offered.json().offerId,
      offeredByUserId: white.userId,
      state: { status: 'active' },
    });

    // Reconnecting (e.g. a page refresh) after the live event was already
    // delivered must still surface the still-pending offer in the join
    // snapshot, not just at the moment it was created.
    blackSocket.close();
    const reconnectedBlack = await connect(black);
    const reconnectSnapshot = waitFor(reconnectedBlack, 'game.snapshot');
    send(reconnectedBlack, 'game.join', { gameId, lastKnownVersion: 0 });
    expect((await reconnectSnapshot).data.state).toMatchObject({
      pendingDrawOffer: {
        offerId: offered.json().offerId,
        offeredByUserId: white.userId,
      },
    });

    const whiteFinished = waitFor(whiteSocket, 'game.finished');
    const accepted = await app.inject({
      headers: { authorization: `Bearer ${black.accessToken}` },
      method: 'POST',
      url: `/v1/games/${gameId}/draw-offers`,
    });
    expect(accepted.statusCode, accepted.body).toBe(201);
    expect((await whiteFinished).data.state).toMatchObject({
      result: 'draw',
      status: 'finished',
      termination: 'agreement',
      version: 1,
    });
  }, 10_000);

  it('persists an authoritative timeout before rejecting a late move', async () => {
    const created = await app.inject({
      headers: { authorization: `Bearer ${white.accessToken}` },
      method: 'POST',
      payload: {
        creatorColor: 'white',
        opponentUserId: black.userId,
        timeControlCode: 'bullet-1-0',
      },
      url: '/v1/games',
    });
    const gameId = created.json().id as string;
    const database = app.get(DatabaseService);
    await database.client`
      UPDATE games
      SET
        white_clock_ms = 1,
        active_clock_started_at = now() - interval '1 second'
      WHERE id = ${gameId}
    `;

    const lateMove = await app.inject({
      headers: { authorization: `Bearer ${white.accessToken}` },
      method: 'POST',
      payload: {
        clientMoveId: '018f47f4-7b2f-4d90-8a66-b00000000005',
        expectedVersion: 0,
        uci: 'e2e4',
      },
      url: `/v1/games/${gameId}/moves`,
    });
    expect(lateMove.statusCode).toBe(409);

    const state = await app.inject({
      headers: { authorization: `Bearer ${black.accessToken}` },
      method: 'GET',
      url: `/v1/games/${gameId}`,
    });
    expect(state.json()).toMatchObject({
      blackClockMs: 60_000,
      result: 'black_win',
      status: 'finished',
      termination: 'timeout',
      version: 1,
      whiteClockMs: 0,
    });
    const moves = await app.inject({
      headers: { authorization: `Bearer ${white.accessToken}` },
      method: 'GET',
      url: `/v1/games/${gameId}/moves`,
    });
    expect(moves.json()).toHaveLength(0);
  });

  it('finishes an active room when the server timer expires', async () => {
    const created = await app.inject({
      headers: { authorization: `Bearer ${white.accessToken}` },
      method: 'POST',
      payload: {
        creatorColor: 'white',
        opponentUserId: black.userId,
        timeControlCode: 'bullet-1-0',
      },
      url: '/v1/games',
    });
    const gameId = created.json().id as string;
    const database = app.get(DatabaseService);
    await database.client`
      UPDATE games
      SET
        white_clock_ms = 100,
        active_clock_started_at = now()
      WHERE id = ${gameId}
    `;

    const socket = await connect(black);
    const snapshot = waitFor(socket, 'game.snapshot');
    const finished = waitFor(socket, 'game.finished');
    send(socket, 'game.join', { gameId, lastKnownVersion: 0 });
    await snapshot;
    expect((await finished).data.state).toMatchObject({
      result: 'black_win',
      status: 'finished',
      termination: 'timeout',
      version: 1,
      whiteClockMs: 0,
    });
  }, 10_000);

  it('holds the clock only while a capture film plays', async () => {
    const created = await app.inject({
      headers: { authorization: `Bearer ${white.accessToken}` },
      method: 'POST',
      payload: {
        creatorColor: 'white',
        opponentUserId: black.userId,
        timeControlCode: 'blitz-3-0',
      },
      url: '/v1/games',
    });
    expect(created.statusCode, created.body).toBe(201);
    const gameId = created.json().id as string;
    const whiteSocket = await connect(white);
    const blackSocket = await connect(black);
    for (const socket of [whiteSocket, blackSocket]) {
      const snapshot = waitFor(socket, 'game.snapshot');
      send(socket, 'game.join', { gameId, lastKnownVersion: 0 });
      await snapshot;
    }
    const startsIn = (clock: MessageEnvelope['data']['clock']) =>
      Date.parse(clock.activeClockStartedAt ?? '') - Date.parse(clock.serverNow);

    await submit(whiteSocket, gameId, '018f47f4-7b2f-4d90-8a66-c00000000001', 0, 'e2e4');
    await submit(blackSocket, gameId, '018f47f4-7b2f-4d90-8a66-c00000000002', 1, 'd7d5');
    const capture = await submit(
      whiteSocket,
      gameId,
      '018f47f4-7b2f-4d90-8a66-c00000000003',
      2,
      'e4d5',
    );
    // No film reported: the clock of the side to move runs from the capture.
    expect(startsIn(capture.clock)).toBeLessThanOrEqual(0);

    // White's film starts: nobody's clock runs until the film is over.
    const held = waitFor(blackSocket, 'game.clock_updated');
    send(whiteSocket, 'game.capture_film', { gameId, playing: true, ply: 3 });
    const pause = startsIn((await held).data.clock);
    expect(pause).toBeGreaterThan(5_000);
    expect(pause).toBeLessThanOrEqual(11_000);

    // Black (to move) skips its own film: its clock runs again at once.
    const released = waitFor(whiteSocket, 'game.clock_updated');
    send(blackSocket, 'game.capture_film', { gameId, playing: false, ply: 3 });
    expect(startsIn((await released).data.clock)).toBeLessThanOrEqual(0);

    // A film for a move that was not a capture changes nothing.
    const refused = waitFor(whiteSocket, 'game.clock_updated').then(
      () => true,
      () => false,
    );
    send(whiteSocket, 'game.capture_film', { gameId, playing: true, ply: 1 });
    expect(await refused).toBe(false);
    whiteSocket.close();
    blackSocket.close();
  }, 20_000);

  it('rate limits commands on each WebSocket connection', async () => {
    const socket = await connect(white);
    const rejected = waitFor(socket, 'game.error');
    for (let index = 0; index < 30; index += 1) {
      send(socket, 'auth.authenticate', {
        accessToken: white.accessToken,
        protocolVersion: 1,
      });
    }
    expect((await rejected).data).toMatchObject({
      event: 'auth.authenticate',
      status: 429,
    });
  });
});
