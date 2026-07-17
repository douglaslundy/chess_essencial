import { ChessJsRules } from '@xadrez/chess-domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../bootstrap.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;
interface Identity {
  accessToken: string;
  userId: string;
}

describeDatabase('games database integration', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let white: Identity;
  let black: Identity;
  let gameId = '';

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    white = await createIdentity('white@example.com', 'game_white');
    black = await createIdentity('black@example.com', 'game_black');
  });
  afterAll(async () => app.close());

  async function createIdentity(email: string, username: string): Promise<Identity> {
    const registration = await app.inject({
      method: 'POST',
      payload: {
        displayName: username,
        email,
        password: 'game integration password 2026',
        username,
      },
      url: '/v1/auth/register',
    });
    expect(registration.statusCode).toBe(201);
    const registered = registration.json();
    expect(
      (
        await app.inject({
          method: 'POST',
          payload: { token: registered.verificationToken },
          url: '/v1/auth/verify',
        })
      ).statusCode,
    ).toBe(200);
    const login = await app.inject({
      method: 'POST',
      payload: { identifier: email, password: 'game integration password 2026' },
      url: '/v1/auth/login',
    });
    expect(login.statusCode).toBe(200);
    return { accessToken: login.json().tokens.accessToken, userId: registered.user.id };
  }

  const auth = (identity: Identity) => ({ authorization: `Bearer ${identity.accessToken}` });
  async function move(
    identity: Identity,
    clientMoveId: string,
    expectedVersion: number,
    uci: string,
  ) {
    return app.inject({
      headers: auth(identity),
      method: 'POST',
      payload: { clientMoveId, expectedVersion, uci },
      url: `/v1/games/${gameId}/moves`,
    });
  }

  it('creates server-owned state', async () => {
    const response = await app.inject({
      headers: auth(white),
      method: 'POST',
      payload: {
        opponentUserId: black.userId,
        timeControlCode: 'blitz-3-0',
        currentFen: 'untrusted',
      },
      url: '/v1/games',
    });
    expect(response.statusCode, response.body).toBe(201);
    const game = response.json();
    gameId = game.id;
    expect(game).toMatchObject({
      blackClockMs: 180_000,
      currentFen: new ChessJsRules().fen(),
      sideToMove: 'white',
      status: 'active',
      version: 0,
      whiteClockMs: 180_000,
    });
  });

  it('enforces turn and clientMoveId idempotency', async () => {
    expect((await move(black, '018f47f4-7b2f-4d90-8a66-a00000000001', 0, 'e7e5')).statusCode).toBe(
      403,
    );
    const id = '018f47f4-7b2f-4d90-8a66-a00000000002';
    const first = await move(white, id, 0, 'f2f3');
    expect(first.statusCode, first.body).toBe(201);
    expect(first.json()).toMatchObject({ move: { san: 'f3' }, state: { version: 1 } });
    const repeated = await move(white, id, 0, 'f2f3');
    expect(repeated.statusCode).toBe(201);
    expect(repeated.json().move.id).toBe(first.json().move.id);
    const listed = await app.inject({
      headers: auth(white),
      method: 'GET',
      url: `/v1/games/${gameId}/moves`,
    });
    expect(listed.json()).toHaveLength(1);
  });

  it('persists mate, reconstructs FEN and generates PGN', async () => {
    expect((await move(black, '018f47f4-7b2f-4d90-8a66-a00000000003', 1, 'e7e5')).statusCode).toBe(
      201,
    );
    expect((await move(white, '018f47f4-7b2f-4d90-8a66-a00000000004', 2, 'g2g4')).statusCode).toBe(
      201,
    );
    const mate = await move(black, '018f47f4-7b2f-4d90-8a66-a00000000005', 3, 'd8h4');
    expect(mate.statusCode, mate.body).toBe(201);
    expect(mate.json().state).toMatchObject({
      result: 'black_win',
      status: 'finished',
      termination: 'checkmate',
      version: 4,
    });
    const response = await app.inject({
      headers: auth(black),
      method: 'GET',
      url: `/v1/games/${gameId}/moves`,
    });
    const moves = response.json();
    expect(moves).toHaveLength(4);
    expect(
      new ChessJsRules(
        'startpos',
        moves.map((item: { uci: string }) => item.uci),
      ).fen(),
    ).toBe(mate.json().state.currentFen);
    const pgn = await app.inject({
      headers: auth(white),
      method: 'GET',
      url: `/v1/games/${gameId}/pgn`,
    });
    expect(pgn.statusCode).toBe(200);
    expect(pgn.body).toContain('Qh4#');
  });

  it('rejects moves after game end', async () => {
    const response = await move(white, '018f47f4-7b2f-4d90-8a66-a00000000006', 4, 'e2e4');
    expect(response.statusCode).toBe(409);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json().detail).toContain('ativa');
  });
});
