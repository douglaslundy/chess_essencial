import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../bootstrap.js';
import { DatabaseService } from '../database/database.service.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

interface Identity {
  accessToken: string;
  userId: string;
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
    return { accessToken: login.json().tokens.accessToken, userId: registered.user.id };
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
