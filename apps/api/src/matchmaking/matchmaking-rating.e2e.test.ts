import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../bootstrap.js';
import { DatabaseService } from '../database/database.service.js';
import { RatingsService } from '../ratings/application/ratings.service.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

interface Identity {
  accessToken: string;
  userId: string;
}

describeDatabase('matchmaking and rating database integration', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let database: DatabaseService;
  let ratings: RatingsService;
  let first: Identity;
  let second: Identity;
  let gameId = '';

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    database = app.get(DatabaseService);
    ratings = app.get(RatingsService);
    first = await createIdentity('phase5-first@example.com', 'phase5_first');
    second = await createIdentity('phase5-second@example.com', 'phase5_second');
  });

  afterAll(async () => app.close());

  async function createIdentity(email: string, username: string): Promise<Identity> {
    const registration = await app.inject({
      method: 'POST',
      payload: { displayName: username, email, password: 'phase five password 2026', username },
      url: '/v1/auth/register',
    });
    expect(registration.statusCode, registration.body).toBe(201);
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
      payload: { identifier: email, password: 'phase five password 2026' },
      url: '/v1/auth/login',
    });
    return { accessToken: login.json().tokens.accessToken, userId: registered.user.id };
  }

  const auth = (identity: Identity) => ({ authorization: `Bearer ${identity.accessToken}` });

  it('matches one queue pair under a lock and creates one authoritative game', async () => {
    const queued = await app.inject({
      headers: auth(first),
      method: 'POST',
      payload: { timeControlCode: 'blitz-3-0' },
      url: '/v1/matchmaking/queues',
    });
    expect(queued.statusCode, queued.body).toBe(201);
    expect(queued.json()).toMatchObject({ status: 'queued', minRating: 0, maxRating: 100 });

    const matched = await app.inject({
      headers: auth(second),
      method: 'POST',
      payload: { timeControlCode: 'blitz-3-0' },
      url: '/v1/matchmaking/queues',
    });
    expect(matched.statusCode, matched.body).toBe(201);
    expect(matched.json().status).toBe('matched');
    gameId = matched.json().gameId;

    const [counts] = await database.client<{ games: number; queued: number }[]>`
      SELECT
        (SELECT count(*) FROM games WHERE id = ${gameId})::integer AS games,
        (SELECT count(*) FROM matchmaking_queue
          WHERE user_id IN (${first.userId}, ${second.userId}))::integer AS queued
    `;
    expect(counts).toEqual({ games: 1, queued: 0 });
  });

  it('creates a rated authoritative bot game (matching the chosen time control) with chosen color and difficulty', async () => {
    const created = await app.inject({
      headers: auth(first),
      method: 'POST',
      payload: {
        botDifficulty: 'expert',
        playerColor: 'black',
        timeControlCode: 'blitz-3-0',
      },
      url: '/v1/matchmaking/bot-games',
    });
    expect(created.statusCode, created.body).toBe(201);
    const game = created.json();
    expect(game).toMatchObject({ sideToMove: 'black', status: 'active', version: 1 });
    expect(game.players).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ color: 'black', userId: first.userId }),
        expect.objectContaining({ color: 'white', ratingBefore: 2000 }),
      ]),
    );

    const humanMove = await app.inject({
      headers: auth(first),
      method: 'POST',
      payload: {
        clientMoveId: '018f47f4-7b2f-4d90-8a66-b00000000001',
        expectedVersion: 1,
        uci: 'e7e5',
      },
      url: `/v1/games/${game.id}/moves`,
    });
    expect(humanMove.statusCode, humanMove.body).toBe(201);
    expect(humanMove.json().state.version).toBe(3);

    const [persisted] = await database.client<
      { difficulty: string; moves: number; rated: boolean; targetRating: number }[]
    >`
      SELECT games.rated, game_bots.difficulty,
        game_bots.target_rating AS "targetRating",
        (SELECT count(*) FROM game_moves WHERE game_id = games.id)::integer AS moves
      FROM games
      JOIN game_bots ON game_bots.game_id = games.id
      WHERE games.id = ${game.id}
    `;
    expect(persisted).toEqual({
      difficulty: 'expert',
      moves: 3,
      rated: true,
      targetRating: 2000,
    });
  });

  it('coach mode always matches the bot to the player rating and is never rated, regardless of difficulty or time control', async () => {
    const student = await createIdentity('phase5-coach@example.com', 'phase5_coach');

    const created = await app.inject({
      headers: auth(student),
      method: 'POST',
      payload: {
        botDifficulty: 'expert', // must be ignored — coach mode always matches the player's rating
        coachMode: true,
        playerColor: 'white',
        timeControlCode: 'blitz-3-0', // normally rated, but not for coach mode
      },
      url: '/v1/matchmaking/bot-games',
    });
    expect(created.statusCode, created.body).toBe(201);
    const game = created.json();
    expect(game.coachMode).toBe(true);

    const [persisted] = await database.client<
      { difficulty: string; rated: boolean; targetRating: number }[]
    >`
      SELECT games.rated, game_bots.difficulty, game_bots.target_rating AS "targetRating"
      FROM games
      JOIN game_bots ON game_bots.game_id = games.id
      WHERE games.id = ${game.id}
    `;
    expect(persisted).toEqual({ difficulty: 'matched', rated: false, targetRating: 100 });
  });

  it('leaves an untimed bot game unrated', async () => {
    const created = await app.inject({
      headers: auth(first),
      method: 'POST',
      payload: {
        botDifficulty: 'beginner',
        playerColor: 'white',
        timeControlCode: 'untimed',
      },
      url: '/v1/matchmaking/bot-games',
    });
    expect(created.statusCode, created.body).toBe(201);
    const game = created.json();

    const [persisted] = await database.client<{ rated: boolean }[]>`
      SELECT rated FROM games WHERE id = ${game.id}
    `;
    expect(persisted).toEqual({ rated: false });
  });

  it('rates the human but never the shared bot account when a bot game finishes', async () => {
    const BOT_USER_ID = '00000000-0000-4000-8000-000000000b07';
    const human = await createIdentity('phase5-bot-rating@example.com', 'phase5_bot_rating');
    const created = await app.inject({
      headers: auth(human),
      method: 'POST',
      payload: {
        botDifficulty: 'expert',
        playerColor: 'white',
        timeControlCode: 'blitz-3-0',
      },
      url: '/v1/matchmaking/bot-games',
    });
    expect(created.statusCode, created.body).toBe(201);
    const game = created.json();

    const resigned = await app.inject({
      headers: auth(human),
      method: 'POST',
      url: `/v1/games/${game.id}/resign`,
    });
    expect(resigned.statusCode, resigned.body).toBe(200);
    expect(resigned.json()).toMatchObject({ result: 'black_win', status: 'finished' });

    const [humanProfile] = await database.client<
      { gamesCount: number; losses: number; rating: number }[]
    >`
      SELECT rating, games_count AS "gamesCount", losses
      FROM rating_profiles
      WHERE user_id = ${human.userId} AND pool = 'blitz'
    `;
    expect(humanProfile).toMatchObject({ gamesCount: 1, losses: 1 });
    // Starts at 0 and never goes below it, so a first loss keeps 0.
    expect(humanProfile?.rating).toBe(0);

    const [botProfile] = await database.client<{ count: number }[]>`
      SELECT count(*)::integer AS count FROM rating_profiles WHERE user_id = ${BOT_USER_ID}
    `;
    expect(botProfile?.count).toBe(0);
  });

  it('falls back to a same-rating bot when the human queue has no opponent', async () => {
    const response = await app.inject({
      headers: auth(first),
      method: 'POST',
      payload: {
        botDifficulty: 'matched',
        fallbackToBot: true,
        playerColor: 'white',
        timeControlCode: 'rapid-10-0',
      },
      url: '/v1/matchmaking/queues',
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({ status: 'matched' });

    const [bot] = await database.client<{ color: string; targetRating: number }[]>`
      SELECT player.color, game_bots.target_rating AS "targetRating"
      FROM game_bots
      JOIN game_players player
        ON player.game_id = game_bots.game_id
       AND player.user_id = ${first.userId}
      WHERE game_bots.game_id = ${response.json().gameId}
    `;
    expect(bot).toEqual({ color: 'white', targetRating: 100 });
  });

  it('finishes a matched game and writes an idempotent immutable rating ledger', async () => {
    const stateResponse = await app.inject({
      headers: auth(first),
      method: 'GET',
      url: `/v1/games/${gameId}`,
    });
    const state = stateResponse.json();
    const white = state.players.find((player: { color: string }) => player.color === 'white');
    const whiteIdentity = white.userId === first.userId ? first : second;
    const blackIdentity = white.userId === first.userId ? second : first;
    const moves = [
      [whiteIdentity, 'f2f3'],
      [blackIdentity, 'e7e5'],
      [whiteIdentity, 'g2g4'],
      [blackIdentity, 'd8h4'],
    ] as const;

    for (const [index, [identity, uci]] of moves.entries()) {
      const response = await app.inject({
        headers: auth(identity),
        method: 'POST',
        payload: {
          clientMoveId: `018f47f4-7b2f-4d90-8a66-b0000000000${index + 1}`,
          expectedVersion: index,
          uci,
        },
        url: `/v1/games/${gameId}/moves`,
      });
      expect(response.statusCode, response.body).toBe(201);
    }

    const [ledger] = await database.client<{ count: number; deltaSum: number }[]>`
      SELECT count(*)::integer AS count, sum(delta)::integer AS "deltaSum"
      FROM rating_transactions WHERE game_id = ${gameId}
    `;
    // Both start at 0: the winner gains 20, the loser cannot drop below 0.
    expect(ledger).toEqual({ count: 2, deltaSum: 20 });
    expect(await ratings.processFinishedGame(gameId)).toBe(false);

    const [afterRetry] = await database.client<{ count: number }[]>`
      SELECT count(*)::integer AS count FROM rating_transactions WHERE game_id = ${gameId}
    `;
    expect(afterRetry?.count).toBe(2);
    await expect(
      database.client`UPDATE rating_transactions SET delta = 0 WHERE game_id = ${gameId}`,
    ).rejects.toThrow(/immutable ledger/);

    const history = await app.inject({
      headers: auth(first),
      method: 'GET',
      url: '/v1/ratings/me/history?pool=blitz',
    });
    expect(history.statusCode).toBe(200);
    expect(history.json()).toHaveLength(1);
    expect(history.json()[0]).toMatchObject({ gameId, kFactor: 40, transactionType: 'game' });

    const leaderboard = await app.inject({
      headers: auth(first),
      method: 'GET',
      url: '/v1/ratings/blitz/leaderboard',
    });
    expect(leaderboard.statusCode).toBe(200);
    const phaseFiveRatings = leaderboard
      .json()
      .filter((entry: { userId: string }) => [first.userId, second.userId].includes(entry.userId))
      .map((entry: { rating: number }) => entry.rating)
      .sort((left: number, right: number) => left - right);
    expect(phaseFiveRatings).toEqual([0, 20]);

    expect(await ratings.reverseGame(gameId, 'integration test reversal')).toBe(true);
    expect(await ratings.reverseGame(gameId, 'duplicate reversal')).toBe(false);
    const reversedProfiles = await database.client<{ rating: number }[]>`
      SELECT rating FROM rating_profiles
      WHERE user_id IN (${first.userId}, ${second.userId}) AND pool = 'blitz'
      ORDER BY rating
    `;
    expect(reversedProfiles.map((profile) => profile.rating)).toEqual([0, 0]);
    const [reversedLedger] = await database.client<{ count: number }[]>`
      SELECT count(*)::integer AS count FROM rating_transactions WHERE game_id = ${gameId}
    `;
    expect(reversedLedger?.count).toBe(4);
  });

  it('creates and accepts a direct challenge', async () => {
    const challenged = await createIdentity('phase5-challenged@example.com', 'phase5_challenged');
    const created = await app.inject({
      headers: auth(first),
      method: 'POST',
      payload: {
        challengedUserId: challenged.userId,
        challengerColor: 'white',
        timeControlCode: 'rapid-10-0',
      },
      url: '/v1/matchmaking/challenges',
    });
    expect(created.statusCode, created.body).toBe(201);

    const accepted = await app.inject({
      headers: auth(challenged),
      method: 'POST',
      payload: { accept: true },
      url: `/v1/matchmaking/challenges/${created.json().id}/respond`,
    });
    expect(accepted.statusCode, accepted.body).toBe(201);
    expect(accepted.json()).toMatchObject({ status: 'accepted' });
  });

  it('respects blocks and expands both rating ranges over time', async () => {
    const blockedA = await createIdentity('phase5-block-a@example.com', 'phase5_block_a');
    const blockedB = await createIdentity('phase5-block-b@example.com', 'phase5_block_b');
    await database.client`
      INSERT INTO friendships (requester_id, addressee_id, status)
      VALUES (${blockedA.userId}, ${blockedB.userId}, 'blocked')
    `;
    for (const identity of [blockedA, blockedB]) {
      const response = await app.inject({
        headers: auth(identity),
        method: 'POST',
        payload: { timeControlCode: 'bullet-1-0' },
        url: '/v1/matchmaking/queues',
      });
      expect(response.json().status).toBe('queued');
    }
    await database.client`
      DELETE FROM matchmaking_queue WHERE user_id IN (${blockedA.userId}, ${blockedB.userId})
    `;

    const expandedA = await createIdentity('phase5-expand-a@example.com', 'phase5_expand_a');
    const expandedB = await createIdentity('phase5-expand-b@example.com', 'phase5_expand_b');
    await database.client`
      INSERT INTO rating_profiles (user_id, pool, rating)
      VALUES (${expandedA.userId}, 'rapid', 1200), (${expandedB.userId}, 'rapid', 1450)
    `;
    for (const identity of [expandedA, expandedB]) {
      const response = await app.inject({
        headers: auth(identity),
        method: 'POST',
        payload: { timeControlCode: 'rapid-15-10' },
        url: '/v1/matchmaking/queues',
      });
      expect(response.json().status).toBe('queued');
    }
    await database.client`
      UPDATE matchmaking_queue SET enqueued_at = now() - interval '60 seconds'
      WHERE user_id IN (${expandedA.userId}, ${expandedB.userId})
    `;
    const expandedMatch = await app.inject({
      headers: auth(expandedB),
      method: 'POST',
      payload: { timeControlCode: 'rapid-15-10' },
      url: '/v1/matchmaking/queues',
    });
    expect(expandedMatch.json()).toMatchObject({
      status: 'matched',
      minRating: 1150,
      maxRating: 1750,
    });
  });
});
