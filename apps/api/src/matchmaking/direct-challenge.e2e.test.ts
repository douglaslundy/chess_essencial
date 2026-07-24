import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../bootstrap.js';
import { DatabaseService } from '../database/database.service.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

interface Identity {
  accessToken: string;
  userId: string;
  username: string;
}

describeDatabase('direct challenge between two real users', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let database: DatabaseService;
  let alice: Identity;
  let bob: Identity;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    database = app.get(DatabaseService);
    alice = await createIdentity('direct-challenge-alice@example.com', 'direct_challenge_alice');
    bob = await createIdentity('direct-challenge-bob@example.com', 'direct_challenge_bob');

    await database.client`
      INSERT INTO friendships (requester_id, addressee_id, status)
      VALUES (${alice.userId}, ${bob.userId}, 'accepted')
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
        password: 'direct challenge password 2026',
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
      payload: { identifier: email, password: 'direct challenge password 2026' },
      url: '/v1/auth/login',
    });
    expect(login.statusCode, login.body).toBe(200);
    return { accessToken: login.json().tokens.accessToken, userId: registered.user.id, username };
  }

  it('lets the challenged user see and accept a pending challenge, ending up in the same game', async () => {
    const created = await app.inject({
      headers: auth(alice),
      method: 'POST',
      payload: {
        challengedUserId: bob.userId,
        challengerColor: 'white',
        timeControlCode: 'blitz-3-0',
      },
      url: '/v1/matchmaking/challenges',
    });
    expect(created.statusCode, created.body).toBe(201);
    const challenge = created.json();
    expect(challenge).toMatchObject({ status: 'pending' });

    // Sending a second challenge (either direction) while one is pending
    // must be rejected — this is the "already challenged" behavior the bug
    // report described as trapping both users.
    const duplicate = await app.inject({
      headers: auth(bob),
      method: 'POST',
      payload: {
        challengedUserId: alice.userId,
        challengerColor: null,
        timeControlCode: 'blitz-3-0',
      },
      url: '/v1/matchmaking/challenges',
    });
    expect(duplicate.statusCode, duplicate.body).toBe(409);

    // Root cause regression check: the challenger sees it under "outgoing"...
    const aliceView = await app.inject({
      headers: auth(alice),
      method: 'GET',
      url: '/v1/matchmaking/challenges',
    });
    expect(aliceView.statusCode, aliceView.body).toBe(200);
    expect(aliceView.json()).toMatchObject({
      incoming: [],
      outgoing: [{ id: challenge.id, counterpart: { userId: bob.userId, username: bob.username } }],
    });

    // ...and, crucially, the challenged user can actually discover it under
    // "incoming" — previously there was no endpoint at all for this, so the
    // challenge silently vanished from the recipient's perspective.
    const bobView = await app.inject({
      headers: auth(bob),
      method: 'GET',
      url: '/v1/matchmaking/challenges',
    });
    expect(bobView.statusCode, bobView.body).toBe(200);
    expect(bobView.json()).toMatchObject({
      incoming: [
        { id: challenge.id, counterpart: { userId: alice.userId, username: alice.username } },
      ],
      outgoing: [],
    });

    const accepted = await app.inject({
      headers: auth(bob),
      method: 'POST',
      payload: { accept: true },
      url: `/v1/matchmaking/challenges/${challenge.id}/respond`,
    });
    expect(accepted.statusCode, accepted.body).toBe(201);
    const acceptedBody = accepted.json();
    expect(acceptedBody).toMatchObject({ status: 'accepted' });
    expect(typeof acceptedBody.gameId).toBe('string');

    // Both players can now load the same game.
    for (const identity of [alice, bob]) {
      const state = await app.inject({
        headers: auth(identity),
        method: 'GET',
        url: `/v1/games/${acceptedBody.gameId}`,
      });
      expect(state.statusCode, state.body).toBe(200);
      expect(state.json().id).toBe(acceptedBody.gameId);
    }

    // The resolved challenge no longer shows up as pending for either side,
    // and — since it's no longer "pending" — a fresh challenge is allowed.
    const aliceViewAfter = await app.inject({
      headers: auth(alice),
      method: 'GET',
      url: '/v1/matchmaking/challenges',
    });
    expect(aliceViewAfter.json()).toEqual({ incoming: [], outgoing: [] });
  });

  it('lets the challenged user decline, which frees both sides to challenge again', async () => {
    const created = await app.inject({
      headers: auth(bob),
      method: 'POST',
      payload: {
        challengedUserId: alice.userId,
        challengerColor: null,
        timeControlCode: 'blitz-3-0',
      },
      url: '/v1/matchmaking/challenges',
    });
    expect(created.statusCode, created.body).toBe(201);
    const challenge = created.json();

    const declined = await app.inject({
      headers: auth(alice),
      method: 'POST',
      payload: { accept: false },
      url: `/v1/matchmaking/challenges/${challenge.id}/respond`,
    });
    expect(declined.statusCode, declined.body).toBe(201);
    expect(declined.json()).toMatchObject({ status: 'declined' });

    const bobViewAfter = await app.inject({
      headers: auth(bob),
      method: 'GET',
      url: '/v1/matchmaking/challenges',
    });
    expect(bobViewAfter.json()).toEqual({ incoming: [], outgoing: [] });

    const retried = await app.inject({
      headers: auth(bob),
      method: 'POST',
      payload: {
        challengedUserId: alice.userId,
        challengerColor: null,
        timeControlCode: 'blitz-3-0',
      },
      url: '/v1/matchmaking/challenges',
    });
    expect(retried.statusCode, retried.body).toBe(201);
  });
});
