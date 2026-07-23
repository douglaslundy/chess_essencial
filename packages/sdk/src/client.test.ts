import { describe, expect, it, vi } from 'vitest';

import { XadrezApiClient } from './client.js';

describe('XadrezApiClient authentication contract', () => {
  it('uses the versioned non-web authentication and recovery endpoints', async () => {
    const calls: Array<{ body: string | undefined; path: string }> = [];
    const responses = [
      new Response(
        JSON.stringify({
          tokens: {
            accessToken: 'access',
            accessTokenExpiresIn: 900,
            refreshToken: 'refresh',
            refreshTokenExpiresIn: 86400,
          },
          user: {
            email: 'mobile@example.com',
            emailVerifiedAt: new Date().toISOString(),
            id: '018f47f4-7b2f-4d90-8a66-9abcdef01234',
            profile: {
              avatarUrl: null,
              bio: null,
              birthDate: null,
              countryCode: null,
              displayName: 'Mobile',
              isProfilePublic: true,
              locale: 'pt-BR',
              timezone: 'UTC',
            },
            status: 'active',
            username: 'mobile_user',
          },
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      ),
      new Response(
        JSON.stringify({
          accessToken: 'next-access',
          accessTokenExpiresIn: 900,
          refreshToken: 'next-refresh',
          refreshTokenExpiresIn: 86400,
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      ),
      new Response(null, { status: 204 }),
      new Response(null, { status: 204 }),
      new Response(null, { status: 204 }),
    ];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({
        body: typeof init?.body === 'string' ? init.body : undefined,
        path: String(input).replace('https://api.example/v1', ''),
      });
      return responses.shift()!;
    });
    const client = new XadrezApiClient({
      baseUrl: 'https://api.example/v1/',
      fetch: fetcher as typeof globalThis.fetch,
    });

    const login = await client.login({ identifier: 'mobile@example.com', password: 'password' });
    expect(login.tokens.accessToken).toBe('access');
    const refreshed = await client.refresh({ refreshToken: login.tokens.refreshToken });
    expect(refreshed.accessToken).toBe('next-access');
    await client.logout({ refreshToken: refreshed.refreshToken });
    await client.forgotPassword({ email: 'mobile@example.com' });
    await client.resetPassword({
      newPassword: 'new correct horse battery staple',
      token: 'a'.repeat(32),
    });

    expect(calls.map((call) => call.path)).toEqual([
      '/auth/login',
      '/auth/refresh',
      '/auth/logout',
      '/auth/password/forgot',
      '/auth/password/reset',
    ]);
  });

  it('converts Problem Details into a typed error', async () => {
    const client = new XadrezApiClient({
      baseUrl: 'https://api.example/v1',
      fetch: (async () =>
        new Response(
          JSON.stringify({
            detail: 'Invalid token',
            status: 401,
            title: 'Unauthorized',
            type: 'about:blank',
          }),
          { headers: { 'content-type': 'application/problem+json' }, status: 401 },
        )) as typeof globalThis.fetch,
    });

    await expect(client.refresh({ refreshToken: 'invalid-but-long-enough-token' })).rejects.toEqual(
      expect.objectContaining({ detail: 'Invalid token', status: 401 }),
    );
  });
});
