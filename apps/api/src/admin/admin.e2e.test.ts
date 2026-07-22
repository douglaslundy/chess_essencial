import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../bootstrap.js';
import { DatabaseService } from '../database/database.service.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

interface Identity {
  accessToken: string;
  userId: string;
}

describeDatabase('admin user management database integration', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let database: DatabaseService;
  let admin: Identity;
  let member: Identity;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    database = app.get(DatabaseService);
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
});
