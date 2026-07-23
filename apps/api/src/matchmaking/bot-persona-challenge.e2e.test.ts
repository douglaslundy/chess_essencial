import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../bootstrap.js';
import { DatabaseService } from '../database/database.service.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

interface Identity {
  accessToken: string;
  userId: string;
  username: string;
}

describeDatabase('bot persona challenge database integration', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let database: DatabaseService;
  let human: Identity;
  let personaUserId: string;
  const personaUsername = 'persona_fixture_bot';

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    database = app.get(DatabaseService);
    human = await createIdentity('persona-challenge@example.com', 'persona_challenge_human');

    const [persona] = await database.client<{ id: string }[]>`
      INSERT INTO users (email, username, password_hash, status, email_verified_at)
      VALUES (
        'persona-fixture-bot@bots.internal.xadrez.invalid', ${personaUsername},
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
        ${personaUserId}, 'Fixture Bot', '1990-05-15', 'America/Sao_Paulo', 'pt-BR',
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
    await database.client`
      INSERT INTO friendships (requester_id, addressee_id, status)
      VALUES (${human.userId}, ${personaUserId}, 'accepted')
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
        password: 'bot persona challenge password 2026',
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
      payload: { identifier: email, password: 'bot persona challenge password 2026' },
      url: '/v1/auth/login',
    });
    expect(login.statusCode, login.body).toBe(200);
    return { accessToken: login.json().tokens.accessToken, userId: registered.user.id, username };
  }

  it('auto-accepts a challenge sent to a bot persona and creates a rated game with a game_bots row', async () => {
    const created = await app.inject({
      headers: auth(human),
      method: 'POST',
      payload: {
        challengedUserId: personaUserId,
        challengerColor: 'white',
        timeControlCode: 'blitz-3-0',
      },
      url: '/v1/matchmaking/challenges',
    });
    expect(created.statusCode, created.body).toBe(201);
    const challenge = created.json();
    expect(challenge).toMatchObject({ status: 'accepted' });
    expect(typeof challenge.gameId).toBe('string');

    const [gameBot] = await database.client<{ botUserId: string; rated: boolean }[]>`
      SELECT game_bots.bot_user_id AS "botUserId", games.rated
      FROM game_bots JOIN games ON games.id = game_bots.game_id
      WHERE game_bots.game_id = ${challenge.gameId}
    `;
    expect(gameBot).toMatchObject({ botUserId: personaUserId, rated: true });

    const state = await app.inject({
      headers: auth(human),
      method: 'GET',
      url: `/v1/games/${challenge.gameId}`,
    });
    expect(state.statusCode, state.body).toBe(200);
    // Human plays white, so nothing should have auto-moved yet.
    expect(state.json().version).toBe(1);
  });

  it('rates both the human and the persona symmetrically when the game finishes', async () => {
    const created = await app.inject({
      headers: auth(human),
      method: 'POST',
      payload: {
        challengedUserId: personaUserId,
        challengerColor: 'black',
        timeControlCode: 'blitz-3-0',
      },
      url: '/v1/matchmaking/challenges',
    });
    expect(created.statusCode, created.body).toBe(201);
    const gameId = created.json().gameId as string;

    // The persona plays white and should have auto-moved already.
    const afterOpening = await app.inject({
      headers: auth(human),
      method: 'GET',
      url: `/v1/games/${gameId}`,
    });
    expect(afterOpening.json().version).toBe(2);

    const resigned = await app.inject({
      headers: auth(human),
      method: 'POST',
      url: `/v1/games/${gameId}/resign`,
    });
    expect(resigned.statusCode, resigned.body).toBe(200);
    expect(resigned.json()).toMatchObject({ result: 'white_win', status: 'finished' });

    const [humanProfile] = await database.client<{ gamesCount: number; losses: number }[]>`
      SELECT games_count AS "gamesCount", losses
      FROM rating_profiles WHERE user_id = ${human.userId} AND pool = 'blitz'
    `;
    expect(humanProfile).toMatchObject({ gamesCount: 1, losses: 1 });

    const [personaProfile] = await database.client<{ gamesCount: number; wins: number }[]>`
      SELECT games_count AS "gamesCount", wins
      FROM rating_profiles WHERE user_id = ${personaUserId} AND pool = 'blitz'
    `;
    expect(personaProfile).toMatchObject({ gamesCount: 1, wins: 1 });
  });
});
