import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../bootstrap.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

interface Identity {
  accessToken: string;
  userId: string;
}

describeDatabase('release journey with two users', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let first: Identity;
  let second: Identity;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    const suffix = randomUUID().slice(0, 8);
    first = await createIdentity(`release-a-${suffix}@example.com`, `release_a_${suffix}`);
    second = await createIdentity(`release-b-${suffix}@example.com`, `release_b_${suffix}`);
  });

  afterAll(async () => app.close());

  async function createIdentity(email: string, username: string): Promise<Identity> {
    const password = 'release journey password 2026';
    const registration = await app.inject({
      method: 'POST',
      payload: { displayName: username, email, password, username },
      url: '/v1/auth/register',
    });
    expect(registration.statusCode, registration.body).toBe(201);
    const registered = registration.json();

    const verification = await app.inject({
      method: 'POST',
      payload: { token: registered.verificationToken },
      url: '/v1/auth/verify',
    });
    expect(verification.statusCode, verification.body).toBe(200);

    const login = await app.inject({
      method: 'POST',
      payload: { identifier: email, password },
      url: '/v1/auth/login',
    });
    expect(login.statusCode, login.body).toBe(200);
    return { accessToken: login.json().tokens.accessToken, userId: registered.user.id };
  }

  const auth = (identity: Identity) => ({ authorization: `Bearer ${identity.accessToken}` });

  it('matches, plays, persists and rates one complete game', async () => {
    const queued = await app.inject({
      headers: auth(first),
      method: 'POST',
      payload: { timeControlCode: 'blitz-3-0' },
      url: '/v1/matchmaking/queues',
    });
    expect(queued.statusCode, queued.body).toBe(201);
    expect(queued.json().status).toBe('queued');

    const matched = await app.inject({
      headers: auth(second),
      method: 'POST',
      payload: { timeControlCode: 'blitz-3-0' },
      url: '/v1/matchmaking/queues',
    });
    expect(matched.statusCode, matched.body).toBe(201);
    expect(matched.json().status).toBe('matched');
    const gameId = matched.json().gameId as string;

    const initial = await app.inject({
      headers: auth(first),
      method: 'GET',
      url: `/v1/games/${gameId}`,
    });
    expect(initial.statusCode, initial.body).toBe(200);
    const whiteUserId = initial
      .json()
      .players.find((player: { color: string }) => player.color === 'white').userId as string;
    const white = whiteUserId === first.userId ? first : second;
    const black = whiteUserId === first.userId ? second : first;

    const moves = [
      [white, 'f2f3'],
      [black, 'e7e5'],
      [white, 'g2g4'],
      [black, 'd8h4'],
    ] as const;

    for (const [version, [identity, uci]] of moves.entries()) {
      const moved = await app.inject({
        headers: auth(identity),
        method: 'POST',
        payload: { clientMoveId: randomUUID(), expectedVersion: version, uci },
        url: `/v1/games/${gameId}/moves`,
      });
      expect(moved.statusCode, moved.body).toBe(201);
    }

    for (const identity of [first, second]) {
      const game = await app.inject({
        headers: auth(identity),
        method: 'GET',
        url: `/v1/games/${gameId}`,
      });
      expect(game.statusCode, game.body).toBe(200);
      expect(game.json()).toMatchObject({
        result: 'black_win',
        status: 'finished',
        termination: 'checkmate',
        version: 4,
      });

      const ratingHistory = await app.inject({
        headers: auth(identity),
        method: 'GET',
        url: '/v1/ratings/me/history?pool=blitz',
      });
      expect(ratingHistory.statusCode, ratingHistory.body).toBe(200);
      expect(ratingHistory.json()).toHaveLength(1);
      expect(ratingHistory.json()[0].gameId).toBe(gameId);
    }

    const pgn = await app.inject({
      headers: auth(first),
      method: 'GET',
      url: `/v1/games/${gameId}/pgn`,
    });
    expect(pgn.statusCode, pgn.body).toBe(200);
    expect(pgn.body).toContain('Qh4#');
  });
});
