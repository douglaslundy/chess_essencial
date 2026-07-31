import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../bootstrap.js';
import { DatabaseService } from '../database/database.service.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

interface Identity {
  accessToken: string;
  userId: string;
  username: string;
}

describeDatabase('social database integration', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let database: DatabaseService;
  let alice: Identity;
  let bob: Identity;
  let carol: Identity;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    database = app.get(DatabaseService);
    alice = await createIdentity('social-alice@example.com', 'social_alice');
    bob = await createIdentity('social-bob@example.com', 'social_bob');
    carol = await createIdentity('social-carol@example.com', 'social_carol');
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
      payload: { displayName: username, email, password: 'social integration password', username },
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
      payload: { identifier: email, password: 'social integration password' },
      url: '/v1/auth/login',
    });
    expect(login.statusCode, login.body).toBe(200);
    return { accessToken: login.json().tokens.accessToken, userId: registered.user.id, username };
  }

  it('sends, lists and accepts a friend request, then lists the friend', async () => {
    const sent = await app.inject({
      headers: auth(alice),
      method: 'POST',
      payload: { username: bob.username },
      url: '/v1/friends/requests',
    });
    expect(sent.statusCode, sent.body).toBe(201);
    expect(sent.json()).toMatchObject({ username: bob.username });

    const bobRequests = await app.inject({
      headers: auth(bob),
      method: 'GET',
      url: '/v1/friends/requests',
    });
    expect(bobRequests.json().incoming).toMatchObject([{ username: alice.username }]);

    const aliceRequests = await app.inject({
      headers: auth(alice),
      method: 'GET',
      url: '/v1/friends/requests',
    });
    expect(aliceRequests.json().outgoing).toMatchObject([{ username: bob.username }]);

    const accept = await app.inject({
      headers: auth(bob),
      method: 'POST',
      url: `/v1/friends/requests/${alice.username}/accept`,
    });
    expect(accept.statusCode, accept.body).toBe(201);
    expect(accept.json()).toMatchObject({ username: alice.username });

    const bobFriends = await app.inject({
      headers: auth(bob),
      method: 'GET',
      url: '/v1/friends',
    });
    expect(bobFriends.json()).toMatchObject([{ username: alice.username }]);

    const aliceFriends = await app.inject({
      headers: auth(alice),
      method: 'GET',
      url: '/v1/friends',
    });
    expect(aliceFriends.json()).toMatchObject([{ username: bob.username }]);
  });

  it('declines a request instead of accepting it', async () => {
    await app.inject({
      headers: auth(carol),
      method: 'POST',
      payload: { username: bob.username },
      url: '/v1/friends/requests',
    });
    const decline = await app.inject({
      headers: auth(bob),
      method: 'POST',
      url: `/v1/friends/requests/${carol.username}/decline`,
    });
    expect(decline.statusCode, decline.body).toBe(204);

    const bobRequests = await app.inject({
      headers: auth(bob),
      method: 'GET',
      url: '/v1/friends/requests',
    });
    expect(bobRequests.json().incoming).toEqual([]);
  });

  it('rejects duplicate requests and self-requests', async () => {
    const selfRequest = await app.inject({
      headers: auth(alice),
      method: 'POST',
      payload: { username: alice.username },
      url: '/v1/friends/requests',
    });
    expect(selfRequest.statusCode).toBe(400);

    const duplicate = await app.inject({
      headers: auth(alice),
      method: 'POST',
      payload: { username: bob.username },
      url: '/v1/friends/requests',
    });
    expect(duplicate.statusCode).toBe(409);
  });

  it('records a heartbeat and reflects presence on the friend list', async () => {
    const heartbeat = await app.inject({
      headers: auth(bob),
      method: 'POST',
      url: '/v1/presence/heartbeat',
    });
    expect(heartbeat.statusCode, heartbeat.body).toBe(204);

    const aliceFriends = await app.inject({
      headers: auth(alice),
      method: 'GET',
      url: '/v1/friends',
    });
    const bobEntry = aliceFriends
      .json()
      .find((f: { username: string }) => f.username === bob.username);
    expect(bobEntry.presence.online).toBe(true);

    const [row] = await database.client<{ last_seen_at: Date | null }[]>`
      SELECT last_seen_at FROM users WHERE id = ${bob.userId}
    `;
    expect(row?.last_seen_at).not.toBeNull();
  });

  it('shows the public profile with friendship status and ratings visibility', async () => {
    const profile = await app.inject({
      headers: auth(alice),
      method: 'GET',
      url: `/v1/users/${bob.username}`,
    });
    expect(profile.statusCode, profile.body).toBe(200);
    expect(profile.json()).toMatchObject({ friendshipStatus: 'friends', username: bob.username });

    const strangerProfile = await app.inject({
      headers: auth(carol),
      method: 'GET',
      url: `/v1/users/${bob.username}`,
    });
    expect(strangerProfile.json()).toMatchObject({ friendshipStatus: 'none' });
  });

  it('enforces profile and friend-request privacy without hiding the owner from themself', async () => {
    const privacy = await app.inject({
      headers: auth(bob),
      method: 'PATCH',
      payload: { allowFriendRequests: false, isProfilePublic: false },
      url: '/v1/me/privacy',
    });
    expect(privacy.statusCode, privacy.body).toBe(200);

    const friendProfile = await app.inject({
      headers: auth(alice),
      method: 'GET',
      url: `/v1/users/${bob.username}`,
    });
    expect(friendProfile.statusCode, friendProfile.body).toBe(200);
    expect(friendProfile.json()).toMatchObject({ friendshipStatus: 'friends' });

    const privateProfile = await app.inject({
      headers: auth(carol),
      method: 'GET',
      url: `/v1/users/${bob.username}`,
    });
    expect(privateProfile.statusCode).toBe(404);

    const selfProfile = await app.inject({
      headers: auth(bob),
      method: 'GET',
      url: `/v1/users/${bob.username}`,
    });
    expect(selfProfile.statusCode, selfProfile.body).toBe(200);
    expect(selfProfile.json()).toMatchObject({ friendshipStatus: 'self' });

    const refusedRequest = await app.inject({
      headers: auth(carol),
      method: 'POST',
      payload: { username: bob.username },
      url: '/v1/friends/requests',
    });
    expect(refusedRequest.statusCode).toBe(400);

    const leaderboard = await app.inject({
      headers: auth(carol),
      method: 'GET',
      url: '/v1/ratings/blitz/leaderboard',
    });
    expect(leaderboard.statusCode, leaderboard.body).toBe(200);
    expect(
      leaderboard.json().some((entry: { username: string }) => entry.username === bob.username),
    ).toBe(false);
  });

  it('removes a friend so neither side sees the other anymore', async () => {
    const remove = await app.inject({
      headers: auth(alice),
      method: 'DELETE',
      url: `/v1/friends/${bob.userId}`,
    });
    expect(remove.statusCode, remove.body).toBe(204);

    const aliceFriends = await app.inject({
      headers: auth(alice),
      method: 'GET',
      url: '/v1/friends',
    });
    expect(aliceFriends.json()).toEqual([]);

    const formerFriendProfile = await app.inject({
      headers: auth(alice),
      method: 'GET',
      url: `/v1/users/${bob.username}`,
    });
    expect(formerFriendProfile.statusCode).toBe(404);
  });
});
