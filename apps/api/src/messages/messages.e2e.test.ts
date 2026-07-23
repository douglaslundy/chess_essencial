import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../bootstrap.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

interface Identity {
  accessToken: string;
  userId: string;
  username: string;
}

describeDatabase('messages database integration', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let alice: Identity;
  let bob: Identity;
  let carol: Identity;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    alice = await createIdentity('messages-alice@example.com', 'messages_alice');
    bob = await createIdentity('messages-bob@example.com', 'messages_bob');
    carol = await createIdentity('messages-carol@example.com', 'messages_carol');
    await befriend(alice, bob);
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
        password: 'messages integration password',
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
      payload: { identifier: email, password: 'messages integration password' },
      url: '/v1/auth/login',
    });
    expect(login.statusCode, login.body).toBe(200);
    return { accessToken: login.json().tokens.accessToken, userId: registered.user.id, username };
  }

  async function befriend(first: Identity, second: Identity) {
    await app.inject({
      headers: auth(first),
      method: 'POST',
      payload: { username: second.username },
      url: '/v1/friends/requests',
    });
    await app.inject({
      headers: auth(second),
      method: 'POST',
      url: `/v1/friends/requests/${first.username}/accept`,
    });
  }

  it('refuses to exchange messages between strangers', async () => {
    const send = await app.inject({
      headers: auth(alice),
      method: 'POST',
      payload: { body: 'Oi!' },
      url: `/v1/messages/${carol.userId}`,
    });
    expect(send.statusCode, send.body).toBe(403);

    const list = await app.inject({
      headers: auth(alice),
      method: 'GET',
      url: `/v1/messages/${carol.userId}`,
    });
    expect(list.statusCode, list.body).toBe(403);
  });

  it('sends messages between friends and lists them in order', async () => {
    const first = await app.inject({
      headers: auth(alice),
      method: 'POST',
      payload: { body: 'Oi Bob!' },
      url: `/v1/messages/${bob.userId}`,
    });
    expect(first.statusCode, first.body).toBe(201);
    expect(first.json()).toMatchObject({ body: 'Oi Bob!', mine: true });

    const reply = await app.inject({
      headers: auth(bob),
      method: 'POST',
      payload: { body: 'Oi Alice!' },
      url: `/v1/messages/${alice.userId}`,
    });
    expect(reply.statusCode, reply.body).toBe(201);

    const aliceHistory = await app.inject({
      headers: auth(alice),
      method: 'GET',
      url: `/v1/messages/${bob.userId}`,
    });
    expect(aliceHistory.statusCode, aliceHistory.body).toBe(200);
    expect(aliceHistory.json()).toMatchObject([
      { body: 'Oi Bob!', mine: true },
      { body: 'Oi Alice!', mine: false },
    ]);

    const bobHistory = await app.inject({
      headers: auth(bob),
      method: 'GET',
      url: `/v1/messages/${alice.userId}`,
    });
    expect(bobHistory.json()).toMatchObject([
      { body: 'Oi Bob!', mine: false },
      { body: 'Oi Alice!', mine: true },
    ]);
  });

  it('tracks unread counts and clears them once the conversation is opened', async () => {
    const conversationsBeforeRead = await app.inject({
      headers: auth(alice),
      method: 'GET',
      url: '/v1/messages/conversations',
    });
    expect(conversationsBeforeRead.statusCode, conversationsBeforeRead.body).toBe(200);
    const bobEntry = conversationsBeforeRead
      .json()
      .find((entry: { userId: string }) => entry.userId === bob.userId);
    expect(bobEntry).toMatchObject({
      lastMessage: { body: 'Oi Alice!', mine: false },
      unreadCount: 1,
    });

    await app.inject({
      headers: auth(alice),
      method: 'GET',
      url: `/v1/messages/${bob.userId}`,
    });

    const conversationsAfterRead = await app.inject({
      headers: auth(alice),
      method: 'GET',
      url: '/v1/messages/conversations',
    });
    const bobEntryAfter = conversationsAfterRead
      .json()
      .find((entry: { userId: string }) => entry.userId === bob.userId);
    expect(bobEntryAfter).toMatchObject({ unreadCount: 0 });
  });
});
