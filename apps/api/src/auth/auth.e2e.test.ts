import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../bootstrap.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

describeDatabase('authentication database integration', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let verificationToken = '';
  let accessToken = '';
  let refreshToken = '';

  beforeAll(async () => {
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns Problem Details for invalid registration', async () => {
    const response = await app.inject({
      method: 'POST',
      payload: { email: 'invalid' },
      url: '/v1/auth/register',
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toMatchObject({ status: 400, title: 'Bad Request' });
  });

  it('registers and exposes no password hash', async () => {
    const response = await app.inject({
      method: 'POST',
      payload: {
        displayName: 'Integração E2E',
        email: 'integration@example.com',
        password: 'integration password 2026',
        username: 'integration_e2e',
      },
      url: '/v1/auth/register',
    });

    expect(response.statusCode).toBe(201);
    expect(response.body).not.toContain('password');
    const body = response.json();
    expect(body.user.status).toBe('pending');
    expect(body.verificationToken).toBeTypeOf('string');
    verificationToken = body.verificationToken;
  });

  it('resends verification without revealing whether an account exists', async () => {
    for (const email of ['integration@example.com', 'missing@example.com']) {
      const response = await app.inject({
        method: 'POST',
        payload: { email },
        url: '/v1/auth/resend-verification',
      });
      expect(response.statusCode).toBe(204);
    }
  });

  it('rejects duplicate identity with Problem Details', async () => {
    const response = await app.inject({
      method: 'POST',
      payload: {
        displayName: 'Integração Duplicada',
        email: 'integration@example.com',
        password: 'integration password 2026',
        username: 'integration_e2e_2',
      },
      url: '/v1/auth/register',
    });

    expect(response.statusCode).toBe(409);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });

  it('verifies, logs in and reads the authenticated profile', async () => {
    const verifyResponse = await app.inject({
      method: 'POST',
      payload: { token: verificationToken },
      url: '/v1/auth/verify',
    });
    expect(verifyResponse.statusCode).toBe(200);
    expect(verifyResponse.json().user.status).toBe('active');

    const loginResponse = await app.inject({
      method: 'POST',
      payload: {
        identifier: 'integration@example.com',
        password: 'integration password 2026',
      },
      url: '/v1/auth/login',
    });
    expect(loginResponse.statusCode).toBe(200);
    const login = loginResponse.json();
    accessToken = login.tokens.accessToken;
    refreshToken = login.tokens.refreshToken;

    const meResponse = await app.inject({
      headers: { authorization: `Bearer ${accessToken}` },
      method: 'GET',
      url: '/v1/me',
    });
    expect(meResponse.statusCode).toBe(200);
    expect(meResponse.json()).toMatchObject({
      email: 'integration@example.com',
      profile: { displayName: 'Integração E2E' },
    });
  });

  it('rotates and revokes a web refresh session through an HttpOnly cookie', async () => {
    const loginResponse = await app.inject({
      headers: { 'x-xadrez-client': 'web' },
      method: 'POST',
      payload: {
        identifier: 'integration@example.com',
        password: 'integration password 2026',
      },
      url: '/v1/auth/login',
    });
    expect(loginResponse.statusCode).toBe(200);
    const loginSetCookie = loginResponse.headers['set-cookie'];
    const loginCookie = (Array.isArray(loginSetCookie) ? loginSetCookie[0] : loginSetCookie)?.split(
      ';',
    )[0];
    expect(loginSetCookie).toContain('HttpOnly');
    expect(loginSetCookie).toContain('SameSite=Lax');
    expect(loginCookie).toContain('xadrez_refresh=');

    const refreshResponse = await app.inject({
      headers: {
        cookie: loginCookie!,
        origin: 'http://localhost:3000',
        'x-xadrez-client': 'web',
        'x-xadrez-csrf': '1',
      },
      method: 'POST',
      payload: {},
      url: '/v1/auth/refresh',
    });
    expect(refreshResponse.statusCode).toBe(200);
    const refreshSetCookie = refreshResponse.headers['set-cookie'];
    const rotatedCookie = (
      Array.isArray(refreshSetCookie) ? refreshSetCookie[0] : refreshSetCookie
    )?.split(';')[0];
    expect(rotatedCookie).not.toBe(loginCookie);

    const logoutResponse = await app.inject({
      headers: {
        cookie: rotatedCookie!,
        origin: 'http://localhost:3000',
        'x-xadrez-client': 'web',
        'x-xadrez-csrf': '1',
      },
      method: 'POST',
      payload: {},
      url: '/v1/auth/logout',
    });
    expect(logoutResponse.statusCode).toBe(204);
    expect(logoutResponse.headers['set-cookie']).toContain('Max-Age=0');

    const repeatedLogoutResponse = await app.inject({
      headers: { 'x-xadrez-client': 'web' },
      method: 'POST',
      payload: {},
      url: '/v1/auth/logout',
    });
    expect(repeatedLogoutResponse.statusCode).toBe(204);
    expect(repeatedLogoutResponse.headers['set-cookie']).toContain('Max-Age=0');
  });

  it('does not enumerate password recovery and rejects an invalid reset token', async () => {
    for (const email of ['integration@example.com', 'missing@example.com']) {
      const response = await app.inject({
        method: 'POST',
        payload: { email },
        url: '/v1/auth/password/forgot',
      });
      expect(response.statusCode).toBe(204);
    }

    const reset = await app.inject({
      method: 'POST',
      payload: {
        newPassword: 'replacement integration password 2026',
        token: 'not-a-valid-password-reset-token-but-long-enough',
      },
      url: '/v1/auth/password/reset',
    });
    expect(reset.statusCode).toBe(401);
    expect(reset.headers['content-type']).toContain('application/problem+json');
  });
  it('updates settings, rotates refresh and detects reuse', async () => {
    const updateResponse = await app.inject({
      headers: { authorization: `Bearer ${accessToken}` },
      method: 'PATCH',
      payload: { countryCode: 'br', isProfilePublic: false, timezone: 'America/Sao_Paulo' },
      url: '/v1/me',
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().profile).toMatchObject({
      countryCode: 'BR',
      isProfilePublic: false,
      timezone: 'America/Sao_Paulo',
    });

    const rotateResponse = await app.inject({
      method: 'POST',
      payload: { refreshToken },
      url: '/v1/auth/refresh',
    });
    expect(rotateResponse.statusCode).toBe(200);
    expect(rotateResponse.json().refreshToken).not.toBe(refreshToken);

    const reuseResponse = await app.inject({
      method: 'POST',
      payload: { refreshToken },
      url: '/v1/auth/refresh',
    });
    expect(reuseResponse.statusCode).toBe(401);
    expect(reuseResponse.json().detail).toContain('Reutilização');
  });

  it('logs out idempotently and rejects requests without bearer token', async () => {
    const logoutResponse = await app.inject({
      method: 'POST',
      payload: { refreshToken: 'not-a-valid-refresh-token-but-long-enough-for-the-contract' },
      url: '/v1/auth/logout',
    });
    expect(logoutResponse.statusCode).toBe(204);

    const meResponse = await app.inject({ method: 'GET', url: '/v1/me' });
    expect(meResponse.statusCode).toBe(401);
  });
});
