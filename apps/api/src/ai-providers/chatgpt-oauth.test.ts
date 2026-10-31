import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  authorizeUrlFor,
  ChatgptOAuthError,
  CHATGPT_PLAN_SCOPE,
  exchangeCode,
  newPendingAuthorization,
} from './chatgpt-oauth.js';

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

describe('ChatGPT OAuth', () => {
  it('builds an authorize URL with PKCE S256, state and the plan-usage scope', () => {
    const pending = newPendingAuthorization('client-123', 'https://api.example/v1/cb');
    const url = new URL(authorizeUrlFor(pending));
    expect(url.origin + url.pathname).toBe('https://auth.openai.com/api/accounts/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-123');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(pending.verifier).digest('base64url'),
    );
    expect(url.searchParams.get('state')).toBe(pending.state);
    expect(url.searchParams.get('scope')).toContain(CHATGPT_PLAN_SCOPE);
  });

  it('exchanges the code with the verifier and reads the account e-mail', async () => {
    const idToken = `x.${Buffer.from(JSON.stringify({ email: 'admin@example.com' })).toString('base64url')}.y`;
    const fetchMock = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          access_token: 'at',
          expires_in: 3600,
          id_token: idToken,
          refresh_token: 'rt',
          scope: `openid ${CHATGPT_PLAN_SCOPE}`,
        }),
      ok: true,
    });
    global.fetch = fetchMock as never;
    const pending = newPendingAuthorization('client-123', 'https://api.example/v1/cb');

    const tokens = await exchangeCode(pending, 'the-code');

    expect(tokens).toMatchObject({
      accessToken: 'at',
      account: 'admin@example.com',
      refreshToken: 'rt',
    });
    const body = new URLSearchParams(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.get('code_verifier')).toBe(pending.verifier);
    expect(body.get('grant_type')).toBe('authorization_code');
  });

  it('refuses a sign-in that did not grant plan usage', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ access_token: 'at', scope: 'openid email' }),
      ok: true,
    }) as never;
    await expect(
      exchangeCode(newPendingAuthorization('c', 'https://api.example/v1/cb'), 'code'),
    ).rejects.toBeInstanceOf(ChatgptOAuthError);
  });
});
