import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../bootstrap.js';
import { DatabaseService } from '../database/database.service.js';
import { RedisService } from '../redis/redis.service.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

interface Identity {
  accessToken: string;
  userId: string;
}

describeDatabase('admin user management database integration', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let database: DatabaseService;
  let redis: RedisService;
  let admin: Identity;
  let member: Identity;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    database = app.get(DatabaseService);
    redis = app.get(RedisService);
    admin = await createIdentity('admin-user@example.com', 'admin_user');
    member = await createIdentity('member-user@example.com', 'member_user');
    await database.client`
      INSERT INTO user_roles (user_id, role) VALUES (${admin.userId}, 'admin')
      ON CONFLICT DO NOTHING
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
      payload: { displayName: username, email, password: 'admin integration password', username },
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
      payload: { identifier: email, password: 'admin integration password' },
      url: '/v1/auth/login',
    });
    expect(login.statusCode, login.body).toBe(200);
    return { accessToken: login.json().tokens.accessToken, userId: registered.user.id };
  }

  it('forbids non-admins from listing users', async () => {
    const response = await app.inject({
      headers: auth(member),
      method: 'GET',
      url: '/v1/admin/users',
    });
    expect(response.statusCode).toBe(403);
  });

  it('lists users for an admin', async () => {
    const response = await app.inject({
      headers: auth(admin),
      method: 'GET',
      url: '/v1/admin/users?q=member_user',
    });
    expect(response.statusCode, response.body).toBe(200);
    const found = response.json().items.find((u: { id: string }) => u.id === member.userId);
    expect(found).toMatchObject({ username: 'member_user', status: 'active', isAdmin: false });
  });

  it('suspends and reactivates a member and revokes their sessions', async () => {
    const suspend = await app.inject({
      headers: auth(admin),
      method: 'PATCH',
      payload: { status: 'suspended' },
      url: `/v1/admin/users/${member.userId}/status`,
    });
    expect(suspend.statusCode, suspend.body).toBe(200);
    expect(suspend.json()).toMatchObject({ status: 'suspended' });

    const [session] = await database.client<{ count: number }[]>`
      SELECT count(*)::integer AS count FROM user_sessions WHERE user_id = ${member.userId}
    `;
    expect(session!.count).toBe(0);

    const reactivate = await app.inject({
      headers: auth(admin),
      method: 'PATCH',
      payload: { status: 'active' },
      url: `/v1/admin/users/${member.userId}/status`,
    });
    expect(reactivate.json()).toMatchObject({ status: 'active' });
  });

  it('refuses to change another admin or oneself', async () => {
    const self = await app.inject({
      headers: auth(admin),
      method: 'PATCH',
      payload: { status: 'suspended' },
      url: `/v1/admin/users/${admin.userId}/status`,
    });
    expect(self.statusCode).toBe(400);
  });

  it('forbids non-admins from viewing bot fleet stats', async () => {
    const response = await app.inject({
      headers: auth(member),
      method: 'GET',
      url: '/v1/admin/bots/stats',
    });
    expect(response.statusCode).toBe(403);
  });

  it('reports bot persona fleet stats for an admin', async () => {
    // Other e2e test files share this database and may create their own bot
    // personas/friendships, so assert the delta this fixture adds rather
    // than exact totals.
    const before = await app.inject({
      headers: auth(admin),
      method: 'GET',
      url: '/v1/admin/bots/stats',
    });
    expect(before.statusCode, before.body).toBe(200);
    const baseline = before.json();

    const [persona] = await database.client<{ id: string }[]>`
      INSERT INTO users (email, username, password_hash, status, email_verified_at)
      VALUES (
        'admin-stats-fixture-bot@bots.internal.xadrez.invalid', 'admin_stats_fixture_bot',
        '$argon2id$v=19$m=65536,t=3,p=4$tfY8w/jfpydVWz+cywI0jQ$EF4JyCThCB04ZUXOZG1g74Ufjwg2BGyiCh3F+L72MNM',
        'active', now()
      )
      RETURNING id
    `;
    await database.client`
      INSERT INTO user_profiles (user_id, display_name, timezone, locale)
      VALUES (${persona!.id}, 'Admin Stats Fixture Bot', 'America/Sao_Paulo', 'pt-BR')
    `;
    await database.client`
      INSERT INTO bot_personas (user_id, target_rating, online_windows)
      VALUES (${persona!.id}, 1200, '[]'::jsonb)
    `;
    await database.client`
      INSERT INTO friendships (requester_id, addressee_id, status)
      VALUES (${member.userId}, ${persona!.id}, 'accepted')
    `;

    const after = await app.inject({
      headers: auth(admin),
      method: 'GET',
      url: '/v1/admin/bots/stats',
    });
    expect(after.statusCode, after.body).toBe(200);
    const stats = after.json();
    expect(stats.total).toBe(baseline.total + 1);
    expect(stats.friendshipsCount).toBe(baseline.friendshipsCount + 1);
  });

  it('forbids non-admins from listing online bots', async () => {
    const response = await app.inject({
      headers: auth(member),
      method: 'GET',
      url: '/v1/admin/bots/online',
    });
    expect(response.statusCode).toBe(403);
  });

  it('lists only the bot personas with an active presence key', async () => {
    const [onlinePersona] = await database.client<{ id: string }[]>`
      INSERT INTO users (email, username, password_hash, status, email_verified_at)
      VALUES (
        'admin-online-fixture-bot@bots.internal.xadrez.invalid', 'admin_online_fixture_bot',
        '$argon2id$v=19$m=65536,t=3,p=4$tfY8w/jfpydVWz+cywI0jQ$EF4JyCThCB04ZUXOZG1g74Ufjwg2BGyiCh3F+L72MNM',
        'active', now()
      )
      RETURNING id
    `;
    await database.client`
      INSERT INTO user_profiles (user_id, display_name, timezone, locale)
      VALUES (${onlinePersona!.id}, 'Online Fixture Bot', 'America/Sao_Paulo', 'pt-BR')
    `;
    await database.client`
      INSERT INTO bot_personas (user_id, target_rating, online_windows)
      VALUES (${onlinePersona!.id}, 1650, '[]'::jsonb)
    `;
    const [offlinePersona] = await database.client<{ id: string }[]>`
      INSERT INTO users (email, username, password_hash, status, email_verified_at)
      VALUES (
        'admin-offline-fixture-bot@bots.internal.xadrez.invalid', 'admin_offline_fixture_bot',
        '$argon2id$v=19$m=65536,t=3,p=4$tfY8w/jfpydVWz+cywI0jQ$EF4JyCThCB04ZUXOZG1g74Ufjwg2BGyiCh3F+L72MNM',
        'active', now()
      )
      RETURNING id
    `;
    await database.client`
      INSERT INTO user_profiles (user_id, display_name, timezone, locale)
      VALUES (${offlinePersona!.id}, 'Offline Fixture Bot', 'America/Sao_Paulo', 'pt-BR')
    `;
    await database.client`
      INSERT INTO bot_personas (user_id, target_rating, online_windows)
      VALUES (${offlinePersona!.id}, 1650, '[]'::jsonb)
    `;
    await redis.client.set(`presence:${onlinePersona!.id}`, '1', 'EX', 90);

    const response = await app.inject({
      headers: auth(admin),
      method: 'GET',
      url: '/v1/admin/bots/online',
    });
    expect(response.statusCode, response.body).toBe(200);
    const online: Array<{ userId: string }> = response.json();
    expect(online.some((bot) => bot.userId === onlinePersona!.id)).toBe(true);
    expect(online.some((bot) => bot.userId === offlinePersona!.id)).toBe(false);

    await redis.client.del(`presence:${onlinePersona!.id}`);
  });
});
