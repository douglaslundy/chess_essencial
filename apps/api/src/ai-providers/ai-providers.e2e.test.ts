import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../bootstrap.js';
import { encryptSecret } from '../common/crypto/secret-cipher.js';
import { DatabaseService } from '../database/database.service.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

interface Identity {
  accessToken: string;
  userId: string;
}

// Note: real validation (PUT with an apiKey) calls the actual provider's
// model-listing endpoint (apps/api/src/ai-providers/model-listing.ts) — no
// sandbox credentials are available in this environment, same limitation
// already documented for the Mercado Pago test-connection endpoint
// (settings.e2e.test.ts). These tests exercise everything that doesn't
// require a real upstream call: guards, exclusivity, and the
// no-key-configured rejection path.
describeDatabase('AI provider keys database integration', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let database: DatabaseService;
  let admin: Identity;
  let member: Identity;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    database = app.get(DatabaseService);
    admin = await createIdentity('ai-providers-admin@example.com', 'ai_providers_admin');
    member = await createIdentity('ai-providers-member@example.com', 'ai_providers_member');
    await database.client`
      INSERT INTO user_roles (user_id, role) VALUES (${admin.userId}, 'admin')
      ON CONFLICT DO NOTHING
    `;
  });

  afterAll(async () => {
    await database.client`DELETE FROM ai_provider_keys`;
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
        password: 'ai providers integration password',
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
      payload: { identifier: email, password: 'ai providers integration password' },
      url: '/v1/auth/login',
    });
    expect(login.statusCode, login.body).toBe(200);
    return { accessToken: login.json().tokens.accessToken, userId: registered.user.id };
  }

  it('forbids non-admins from listing or editing AI provider keys', async () => {
    const list = await app.inject({
      headers: auth(member),
      method: 'GET',
      url: '/v1/admin/ai-providers',
    });
    expect(list.statusCode).toBe(403);

    const update = await app.inject({
      headers: auth(member),
      method: 'PUT',
      payload: { apiKey: 'sk-test', model: 'claude-sonnet-5' },
      url: '/v1/admin/ai-providers/anthropic',
    });
    expect(update.statusCode).toBe(403);
  });

  it('lists all 3 known providers with none configured by default', async () => {
    await database.client`DELETE FROM ai_provider_keys`;
    const response = await app.inject({
      headers: auth(admin),
      method: 'GET',
      url: '/v1/admin/ai-providers',
    });
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as { hasApiKey: boolean; isActive: boolean; provider: string }[];
    expect(body.map((entry) => entry.provider).sort()).toEqual(['anthropic', 'gemini', 'openai']);
    expect(body.every((entry) => !entry.hasApiKey && !entry.isActive)).toBe(true);
  });

  it('rejects saving a key with no apiKey and nothing already on file', async () => {
    await database.client`DELETE FROM ai_provider_keys WHERE provider = 'openai'`;
    const response = await app.inject({
      headers: auth(admin),
      method: 'PUT',
      payload: { model: 'gpt-5.6-luna' },
      url: '/v1/admin/ai-providers/openai',
    });
    expect(response.statusCode, response.body).toBe(400);
  });

  it('refuses to activate a provider that has no key configured', async () => {
    await database.client`DELETE FROM ai_provider_keys WHERE provider = 'gemini'`;
    const response = await app.inject({
      headers: auth(admin),
      method: 'PUT',
      payload: { isActive: true },
      url: '/v1/admin/ai-providers/gemini/active',
    });
    expect(response.statusCode, response.body).toBe(404);
  });

  it('enforces at most one active provider at a time, including via the database constraint', async () => {
    await database.client`DELETE FROM ai_provider_keys`;
    await database.client`
      INSERT INTO ai_provider_keys (provider, encrypted_api_key, key_preview, model, is_active)
      VALUES
        ('anthropic', 'seeded-ciphertext-a', 'aaaa', 'claude-sonnet-5', true),
        ('openai', 'seeded-ciphertext-b', 'bbbb', 'gpt-5.6-luna', false)
    `;

    const activateOpenAi = await app.inject({
      headers: auth(admin),
      method: 'PUT',
      payload: { isActive: true },
      url: '/v1/admin/ai-providers/openai/active',
    });
    expect(activateOpenAi.statusCode, activateOpenAi.body).toBe(200);
    expect(activateOpenAi.json()).toMatchObject({ isActive: true, provider: 'openai' });

    const rows = await database.client<{ isActive: boolean; provider: string }[]>`
      SELECT provider, is_active AS "isActive" FROM ai_provider_keys ORDER BY provider
    `;
    expect(rows).toEqual([
      { isActive: false, provider: 'anthropic' },
      { isActive: true, provider: 'openai' },
    ]);
  });

  it('reports a clean 400 (not a bare 500) when the stored key can no longer be decrypted, without touching what was saved', async () => {
    // Simulates SETTINGS_ENCRYPTION_KEY having changed since this row was
    // encrypted (the real-world trigger, per project history) by
    // encrypting with a key that is definitely not the one this running
    // app instance is using. Leaving apiKey out of the PUT payload is the
    // "keep the current key, just change the model" flow the admin UI
    // explicitly tells admins to use — this is exactly the request that
    // used to 500 with a generic "internal error" instead of a real
    // message (see ai-providers.service.ts#resolvePlainApiKey).
    await database.client`DELETE FROM ai_provider_keys WHERE provider = 'openai'`;
    const undecryptable = encryptSecret('sk-old-value', 'a-completely-different-secret');
    await database.client`
      INSERT INTO ai_provider_keys (provider, encrypted_api_key, key_preview, model, is_active)
      VALUES ('openai', ${undecryptable}, 'valu', 'gpt-5.6-luna', false)
    `;

    const response = await app.inject({
      headers: auth(admin),
      method: 'PUT',
      payload: { model: 'gpt-5.6-luna' },
      url: '/v1/admin/ai-providers/openai',
    });

    expect(response.statusCode, response.body).toBe(400);
    expect(response.body).not.toContain('sk-old-value');
    const problem = response.json() as { detail: string };
    expect(problem.detail).toMatch(/chave|criptografia/i);

    // The unreadable row itself must be untouched - not wiped, not
    // silently overwritten with something else.
    const [row] = await database.client<{ encryptedApiKey: string }[]>`
      SELECT encrypted_api_key AS "encryptedApiKey" FROM ai_provider_keys WHERE provider = 'openai'
    `;
    expect(row!.encryptedApiKey).toBe(undecryptable);
  });

  it('never returns the encrypted key or a full key preview over the API', async () => {
    await database.client`DELETE FROM ai_provider_keys`;
    await database.client`
      INSERT INTO ai_provider_keys (provider, encrypted_api_key, key_preview, model, is_active)
      VALUES ('anthropic', 'seeded-ciphertext', 'ab12', 'claude-sonnet-5', true)
    `;
    const response = await app.inject({
      headers: auth(admin),
      method: 'GET',
      url: '/v1/admin/ai-providers',
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.body).not.toContain('seeded-ciphertext');
    const anthropic = (response.json() as { keyPreview: string; provider: string }[]).find(
      (entry) => entry.provider === 'anthropic',
    );
    expect(anthropic).toMatchObject({ hasApiKey: true, keyPreview: 'ab12' });
  });
});
