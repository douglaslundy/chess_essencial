import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../bootstrap.js';
import { DatabaseService } from '../database/database.service.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

interface Identity {
  accessToken: string;
  userId: string;
  username: string;
}

describeDatabase('safety and privacy database integration', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let database: DatabaseService;
  let actor: Identity;
  let target: Identity;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    database = app.get(DatabaseService);
    actor = await createIdentity('phase11-actor@example.com', 'phase11_actor');
    target = await createIdentity('phase11-target@example.com', 'phase11_target');
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
        password: 'phase eleven integration password',
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
      payload: { identifier: email, password: 'phase eleven integration password' },
      url: '/v1/auth/login',
    });
    expect(login.statusCode, login.body).toBe(200);
    return { accessToken: login.json().tokens.accessToken, userId: registered.user.id, username };
  }

  it('updates privacy and sanitizes persisted profile text', async () => {
    const profile = await app.inject({
      headers: auth(actor),
      method: 'PATCH',
      payload: { bio: '<script>alert(1)</script>Jogador', displayName: '<b>Jogador Seguro</b>' },
      url: '/v1/me',
    });
    expect(profile.statusCode, profile.body).toBe(200);
    expect(profile.json().profile).toMatchObject({
      bio: 'alert(1)Jogador',
      displayName: 'Jogador Seguro',
    });

    const privacy = await app.inject({
      headers: auth(actor),
      method: 'PATCH',
      payload: { allowChallenges: false, allowFriendRequests: false, isProfilePublic: false },
      url: '/v1/me/privacy',
    });
    expect(privacy.statusCode, privacy.body).toBe(200);
    expect(privacy.json()).toEqual({
      allowChallenges: false,
      allowFriendRequests: false,
      isProfilePublic: false,
    });
  });

  it('persists directional blocks and prevents challenges', async () => {
    const request = await app.inject({
      headers: auth(actor),
      method: 'POST',
      payload: { username: target.username },
      url: '/v1/friends/requests',
    });
    expect(request.statusCode, request.body).toBe(201);
    const accepted = await app.inject({
      headers: auth(target),
      method: 'POST',
      url: `/v1/friends/requests/${actor.username}/accept`,
    });
    expect(accepted.statusCode, accepted.body).toBe(201);

    const post = await app.inject({
      headers: auth(target),
      method: 'POST',
      payload: { body: 'Evidência preservada após bloqueio' },
      url: '/v1/posts',
    });
    expect(post.statusCode, post.body).toBe(201);
    const liked = await app.inject({
      headers: auth(actor),
      method: 'POST',
      url: `/v1/posts/${post.json().id}/like`,
    });
    expect(liked.statusCode, liked.body).toBe(201);
    const message = await app.inject({
      headers: auth(actor),
      method: 'POST',
      payload: { body: 'Mensagem preservada para moderação' },
      url: `/v1/messages/${target.userId}`,
    });
    expect(message.statusCode, message.body).toBe(201);

    const blocked = await app.inject({
      headers: auth(actor),
      method: 'PUT',
      url: `/v1/me/blocks/${target.userId}`,
    });
    expect(blocked.statusCode, blocked.body).toBe(204);

    const list = await app.inject({ headers: auth(actor), method: 'GET', url: '/v1/me/blocks' });
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json()).toEqual([
      expect.objectContaining({ id: target.userId, username: 'phase11_target' }),
    ]);

    const friends = await app.inject({ headers: auth(actor), method: 'GET', url: '/v1/friends' });
    expect(friends.json()).toEqual([]);
    const conversations = await app.inject({
      headers: auth(actor),
      method: 'GET',
      url: '/v1/messages/conversations',
    });
    expect(conversations.json()).toEqual([]);
    const blockedMessage = await app.inject({
      headers: auth(target),
      method: 'POST',
      payload: { body: 'Não deve chegar' },
      url: `/v1/messages/${actor.userId}`,
    });
    expect(blockedMessage.statusCode).toBe(403);
    const blockedProfile = await app.inject({
      headers: auth(actor),
      method: 'GET',
      url: `/v1/users/${target.username}`,
    });
    expect(blockedProfile.statusCode).toBe(404);
    const feed = await app.inject({ headers: auth(actor), method: 'GET', url: '/v1/feed' });
    expect(feed.json().some((entry: { id: string }) => entry.id === post.json().id)).toBe(false);
    const blockedLike = await app.inject({
      headers: auth(actor),
      method: 'POST',
      url: `/v1/posts/${post.json().id}/like`,
    });
    expect(blockedLike.statusCode).toBe(404);

    const [evidence] = await database.client<
      { friendships: number; likes: number; messages: number; posts: number }[]
    >`
      SELECT
        (SELECT count(*)::integer FROM friendships
          WHERE (requester_id = ${actor.userId} AND addressee_id = ${target.userId})
             OR (requester_id = ${target.userId} AND addressee_id = ${actor.userId})
        ) AS friendships,
        (SELECT count(*)::integer FROM direct_messages
          WHERE sender_id = ${actor.userId} AND recipient_id = ${target.userId}
        ) AS messages,
        (SELECT count(*)::integer FROM posts WHERE id = ${post.json().id}) AS posts,
        (SELECT count(*)::integer FROM post_likes WHERE post_id = ${post.json().id}) AS likes
    `;
    expect(evidence).toEqual({ friendships: 0, likes: 1, messages: 1, posts: 1 });

    const challenge = await app.inject({
      headers: auth(target),
      method: 'POST',
      payload: { challengedUserId: actor.userId, timeControlCode: 'rapid-10-0' },
      url: '/v1/matchmaking/challenges',
    });
    expect(challenge.statusCode, challenge.body).toBe(403);
  });

  it('creates one sanitized report and records audit events', async () => {
    const payload = {
      category: 'harassment',
      description: '<b>mensagem inadequada</b>',
      reportedUserId: target.userId,
    };
    const report = await app.inject({
      headers: auth(actor),
      method: 'POST',
      payload,
      url: '/v1/reports',
    });
    expect(report.statusCode, report.body).toBe(201);
    expect(report.json()).toMatchObject({ category: 'harassment', status: 'open' });

    const duplicate = await app.inject({
      headers: auth(actor),
      method: 'POST',
      payload,
      url: '/v1/reports',
    });
    expect(duplicate.statusCode, duplicate.body).toBe(409);

    const [persisted] = await database.client<{ description: string }[]>`
      SELECT description FROM moderation_reports WHERE id = ${report.json().id}
    `;
    expect(persisted?.description).toBe('mensagem inadequada');
    const [audit] = await database.client<{ count: number }[]>`
      SELECT count(*)::integer AS count FROM audit_logs
      WHERE actor_user_id = ${actor.userId}
        AND action IN ('user.privacy_updated', 'user.blocked', 'moderation.report_created')
    `;
    expect(audit?.count).toBe(3);
  });
});
