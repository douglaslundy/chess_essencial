import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../bootstrap.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

interface Identity {
  accessToken: string;
  userId: string;
  username: string;
}

describeDatabase('feed database integration', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let alice: Identity;
  let bob: Identity;
  let carol: Identity;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    alice = await createIdentity('feed-alice@example.com', 'feed_alice');
    bob = await createIdentity('feed-bob@example.com', 'feed_bob');
    carol = await createIdentity('feed-carol@example.com', 'feed_carol');
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
      payload: { displayName: username, email, password: 'feed integration password', username },
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
      payload: { identifier: email, password: 'feed integration password' },
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

  it('rejects a post with neither text nor photo', async () => {
    const response = await app.inject({
      headers: auth(alice),
      method: 'POST',
      payload: {},
      url: '/v1/posts',
    });
    expect(response.statusCode, response.body).toBe(400);
  });

  it('creates a text post and shows it to friends but not strangers', async () => {
    const created = await app.inject({
      headers: auth(alice),
      method: 'POST',
      payload: { body: 'Boa partida hoje!' },
      url: '/v1/posts',
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json()).toMatchObject({
      authorUsername: alice.username,
      body: 'Boa partida hoje!',
      likeCount: 0,
      likedByMe: false,
      mine: true,
      photoUrl: null,
    });
    const postId = created.json().id;

    const aliceFeed = await app.inject({ headers: auth(alice), method: 'GET', url: '/v1/feed' });
    expect(aliceFeed.json()).toMatchObject([{ id: postId, mine: true }]);

    const bobFeed = await app.inject({ headers: auth(bob), method: 'GET', url: '/v1/feed' });
    expect(bobFeed.json()).toMatchObject([{ id: postId, mine: false }]);

    const carolFeed = await app.inject({ headers: auth(carol), method: 'GET', url: '/v1/feed' });
    expect(carolFeed.json().find((post: { id: string }) => post.id === postId)).toBeUndefined();
  });

  it('creates a photo-only post using an already-uploaded photo URL', async () => {
    const created = await app.inject({
      headers: auth(bob),
      method: 'POST',
      payload: { photoUrl: 'https://cdn.example.com/avatars/post-bob-test.jpg' },
      url: '/v1/posts',
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json()).toMatchObject({
      body: null,
      photoUrl: 'https://cdn.example.com/avatars/post-bob-test.jpg',
    });
  });

  it('likes and unlikes a post', async () => {
    const created = await app.inject({
      headers: auth(alice),
      method: 'POST',
      payload: { body: 'Outra postagem' },
      url: '/v1/posts',
    });
    const postId = created.json().id;

    const liked = await app.inject({
      headers: auth(bob),
      method: 'POST',
      url: `/v1/posts/${postId}/like`,
    });
    expect(liked.statusCode, liked.body).toBe(201);
    expect(liked.json()).toMatchObject({ likeCount: 1, likedByMe: true });

    const relikeIsIdempotent = await app.inject({
      headers: auth(bob),
      method: 'POST',
      url: `/v1/posts/${postId}/like`,
    });
    expect(relikeIsIdempotent.json()).toMatchObject({ likeCount: 1, likedByMe: true });

    const unliked = await app.inject({
      headers: auth(bob),
      method: 'DELETE',
      url: `/v1/posts/${postId}/like`,
    });
    expect(unliked.statusCode, unliked.body).toBe(204);

    const feedAfterUnlike = await app.inject({
      headers: auth(bob),
      method: 'GET',
      url: '/v1/feed',
    });
    expect(feedAfterUnlike.json()).toMatchObject([{ id: postId, likeCount: 0, likedByMe: false }]);
  });

  it('only lets the author delete their own post', async () => {
    const created = await app.inject({
      headers: auth(alice),
      method: 'POST',
      payload: { body: 'Post para apagar' },
      url: '/v1/posts',
    });
    const postId = created.json().id;

    const strangerDelete = await app.inject({
      headers: auth(bob),
      method: 'DELETE',
      url: `/v1/posts/${postId}`,
    });
    expect(strangerDelete.statusCode).toBe(404);

    const authorDelete = await app.inject({
      headers: auth(alice),
      method: 'DELETE',
      url: `/v1/posts/${postId}`,
    });
    expect(authorDelete.statusCode, authorDelete.body).toBe(204);

    const feed = await app.inject({ headers: auth(alice), method: 'GET', url: '/v1/feed' });
    expect(feed.json().find((post: { id: string }) => post.id === postId)).toBeUndefined();
  });
});
