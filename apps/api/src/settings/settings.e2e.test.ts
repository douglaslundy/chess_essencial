import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../bootstrap.js';
import { DatabaseService } from '../database/database.service.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

interface Identity {
  accessToken: string;
  userId: string;
}

describeDatabase('platform settings database integration', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let database: DatabaseService;
  let admin: Identity;
  let member: Identity;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    database = app.get(DatabaseService);
    admin = await createIdentity('settings-admin@example.com', 'settings_admin');
    member = await createIdentity('settings-member@example.com', 'settings_member');
    await database.client`
      INSERT INTO user_roles (user_id, role) VALUES (${admin.userId}, 'admin')
      ON CONFLICT DO NOTHING
    `;
  });

  afterAll(async () => {
    await database.client`DELETE FROM platform_settings WHERE key = 'payment.mercado_pago'`;
    await database.client`DELETE FROM platform_settings WHERE key = 'features.assisted_game'`;
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
        password: 'settings integration password',
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
      payload: { identifier: email, password: 'settings integration password' },
      url: '/v1/auth/login',
    });
    expect(login.statusCode, login.body).toBe(200);
    return { accessToken: login.json().tokens.accessToken, userId: registered.user.id };
  }

  it('forbids non-admins from reading or writing Mercado Pago settings', async () => {
    const read = await app.inject({
      headers: auth(member),
      method: 'GET',
      url: '/v1/admin/settings/mercado-pago',
    });
    expect(read.statusCode).toBe(403);

    const write = await app.inject({
      headers: auth(member),
      method: 'PUT',
      payload: { environment: 'sandbox', publicKey: 'pub' },
      url: '/v1/admin/settings/mercado-pago',
    });
    expect(write.statusCode).toBe(403);
  });

  it('defaults to sandbox with no access token configured', async () => {
    const response = await app.inject({
      headers: auth(admin),
      method: 'GET',
      url: '/v1/admin/settings/mercado-pago',
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      environment: 'sandbox',
      hasAccessToken: false,
      publicKey: null,
    });
  });

  it('saves the access token, masks it on read, and keeps it when omitted on update', async () => {
    const created = await app.inject({
      headers: auth(admin),
      method: 'PUT',
      payload: {
        accessToken: 'TEST-access-token-abc123',
        environment: 'sandbox',
        publicKey: 'TEST-public-key',
      },
      url: '/v1/admin/settings/mercado-pago',
    });
    expect(created.statusCode, created.body).toBe(200);
    expect(created.json()).toMatchObject({
      environment: 'sandbox',
      hasAccessToken: true,
      publicKey: 'TEST-public-key',
    });
    expect(created.body).not.toContain('TEST-access-token-abc123');

    const updated = await app.inject({
      headers: auth(admin),
      method: 'PUT',
      payload: { environment: 'production', publicKey: 'TEST-public-key-2' },
      url: '/v1/admin/settings/mercado-pago',
    });
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json()).toMatchObject({
      environment: 'production',
      hasAccessToken: true,
      publicKey: 'TEST-public-key-2',
    });

    const [stored] = await database.client<{ value: { accessToken: string } }[]>`
      SELECT value FROM platform_settings WHERE key = 'payment.mercado_pago'
    `;
    expect(stored!.value.accessToken).toBe('TEST-access-token-abc123');
  });

  it('rejects testing the connection before an access token is configured', async () => {
    await database.client`DELETE FROM platform_settings WHERE key = 'payment.mercado_pago'`;
    const response = await app.inject({
      headers: auth(admin),
      method: 'POST',
      url: '/v1/admin/settings/mercado-pago/test-connection',
    });
    expect(response.statusCode, response.body).toBe(400);
  });

  it('defaults the assisted-game feature to disabled', async () => {
    const response = await app.inject({
      headers: auth(admin),
      method: 'GET',
      url: '/v1/admin/settings/assisted-game',
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ enabled: false });
  });

  it('forbids non-admins from enabling the assisted-game feature, but any logged-in user can read it', async () => {
    const write = await app.inject({
      headers: auth(member),
      method: 'PUT',
      payload: { enabled: true },
      url: '/v1/admin/settings/assisted-game',
    });
    expect(write.statusCode).toBe(403);

    const read = await app.inject({
      headers: auth(member),
      method: 'GET',
      url: '/v1/settings/assisted-game',
    });
    expect(read.statusCode, read.body).toBe(200);
    expect(read.json()).toEqual({ enabled: false });
  });

  it('lets an admin enable the assisted-game feature, visible via the public endpoint', async () => {
    const updated = await app.inject({
      headers: auth(admin),
      method: 'PUT',
      payload: { enabled: true },
      url: '/v1/admin/settings/assisted-game',
    });
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json()).toEqual({ enabled: true });

    const read = await app.inject({
      headers: auth(member),
      method: 'GET',
      url: '/v1/settings/assisted-game',
    });
    expect(read.statusCode, read.body).toBe(200);
    expect(read.json()).toEqual({ enabled: true });
  });
});
