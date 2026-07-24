import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../bootstrap.js';
import { DatabaseService } from '../database/database.service.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

interface Identity {
  accessToken: string;
  userId: string;
  username: string;
}

describeDatabase('bot persona queue matching database integration', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let database: DatabaseService;
  let human: Identity;
  let personaUserId: string;
  const personaUsername = 'persona_fixture_queue_bot';

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    database = app.get(DatabaseService);
    human = await createIdentity('persona-queue-match@example.com', 'persona_queue_match_human');

    const [persona] = await database.client<{ id: string }[]>`
      INSERT INTO users (email, username, password_hash, status, email_verified_at)
      VALUES (
        'persona-fixture-queue-bot@bots.internal.xadrez.invalid', ${personaUsername},
        '$argon2id$v=19$m=65536,t=3,p=4$tfY8w/jfpydVWz+cywI0jQ$EF4JyCThCB04ZUXOZG1g74Ufjwg2BGyiCh3F+L72MNM',
        'active', now()
      )
      RETURNING id
    `;
    personaUserId = persona!.id;
    await database.client`
      INSERT INTO user_profiles (
        user_id, display_name, birth_date, timezone, locale,
        is_profile_public, allow_challenges, allow_friend_requests
      )
      VALUES (
        ${personaUserId}, 'Fixture Queue Bot', '1990-05-15', 'America/Sao_Paulo', 'pt-BR',
        true, true, true
      )
    `;
    for (const pool of ['bullet', 'blitz', 'rapid', 'classical', 'correspondence']) {
      await database.client`
        INSERT INTO rating_profiles (user_id, pool, rating, peak_rating)
        VALUES (${personaUserId}, ${pool}::rating_pool, 1200, 1200)
      `;
    }
    await database.client`
      INSERT INTO bot_personas (user_id, target_rating, online_windows)
      VALUES (${personaUserId}, 1200, '[]'::jsonb)
    `;
  });

  afterAll(async () => {
    await app.close();
  });

  function auth(identity: Identity) {
    return { authorization: `Bearer ${identity.accessToken}` };
  }

  async function createIdentity(email: string, username: string): Promise<Identity> {
    const registration = await app.inject({
      method: 'POST',
      payload: {
        displayName: username,
        email,
        password: 'queue bot match password 2026',
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
      payload: { identifier: email, password: 'queue bot match password 2026' },
      url: '/v1/auth/login',
    });
    expect(login.statusCode, login.body).toBe(200);
    return { accessToken: login.json().tokens.accessToken, userId: registered.user.id, username };
  }

  it('matches a human searching the queue with an online bot persona sitting in it, same as a real player', async () => {
    // Simulates what apps/worker/src/bots/queue-job.ts does for an online,
    // idle bot persona: it sits in matchmaking_queue exactly like a human
    // who clicked "buscar adversário" would.
    const [timeControl] = await database.client<{ id: string }[]>`
      SELECT id FROM game_time_controls WHERE code = 'blitz-3-0'
    `;
    await database.client`
      INSERT INTO matchmaking_queue (
        user_id, pool, time_control_id, rating, min_rating, max_rating, enqueued_at, heartbeat_at
      ) VALUES (
        ${personaUserId}, 'blitz', ${timeControl!.id}, 1200, 1100, 1300, now(), now()
      )
    `;

    const joined = await app.inject({
      headers: auth(human),
      method: 'POST',
      payload: { timeControlCode: 'blitz-3-0' },
      url: '/v1/matchmaking/queues',
    });
    expect(joined.statusCode, joined.body).toBe(201);
    const result = joined.json();
    expect(result).toMatchObject({ status: 'matched' });
    expect(typeof result.gameId).toBe('string');

    const [gameBot] = await database.client<{ botUserId: string; rated: boolean }[]>`
      SELECT game_bots.bot_user_id AS "botUserId", games.rated
      FROM game_bots JOIN games ON games.id = game_bots.game_id
      WHERE game_bots.game_id = ${result.gameId}
    `;
    expect(gameBot).toMatchObject({ botUserId: personaUserId, rated: true });

    const [botPlayer] = await database.client<{ color: string }[]>`
      SELECT color FROM game_players WHERE game_id = ${result.gameId} AND user_id = ${personaUserId}
    `;
    const state = await app.inject({
      headers: auth(human),
      method: 'GET',
      url: `/v1/games/${result.gameId}`,
    });
    expect(state.statusCode, state.body).toBe(200);
    // If the bot ended up white it should already have made the opening
    // move (version 2); if black, nothing has moved yet (version 1).
    expect(state.json().version).toBe(botPlayer!.color === 'white' ? 2 : 1);

    const [queueRow] = await database.client<{ userId: string }[]>`
      SELECT user_id AS "userId" FROM matchmaking_queue
      WHERE user_id IN (${human.userId}, ${personaUserId})
    `;
    expect(queueRow).toBeUndefined();
  });
});
