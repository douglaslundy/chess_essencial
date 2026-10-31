import type { Sql } from 'postgres';
import { describe, expect, it, vi } from 'vitest';

import { decryptSecret, encryptSecret } from '../config/secret-cipher.js';
import { CHATGPT_RENEW_MARGIN_MS, freshChatgptAccessToken } from './chatgpt-token.js';

const KEY = 'test-encryption-key';
const NOW = 1_700_000_000_000;

/** Fake postgres.js: begin() hands a tagged-template tx that records queries and returns `row`. */
function fakeSql(row: Record<string, unknown> | undefined) {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const tx = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?');
    queries.push({ text, values });
    return Promise.resolve(text.includes('FROM ai_provider_keys') ? (row ? [row] : []) : []);
  };
  const sql = Object.assign(tx, {
    begin: (run: (t: typeof tx) => unknown) => run(tx),
  }) as unknown as Sql;
  return { queries, sql };
}

function chatgptRow(expiresInMs: number) {
  return {
    accessTokenExpiresAt: new Date(NOW + expiresInMs),
    encryptedApiKey: encryptSecret('old-access', KEY),
    encryptedRefreshToken: encryptSecret('old-refresh', KEY),
    oauthClientId: 'client-1',
  };
}

describe('freshChatgptAccessToken', () => {
  it('returns the stored token while it is still valid, without calling OpenAI', async () => {
    const { queries, sql } = fakeSql(chatgptRow(CHATGPT_RENEW_MARGIN_MS + 60_000));
    const fetchImpl = vi.fn();
    expect(await freshChatgptAccessToken(sql, KEY, fetchImpl, () => NOW)).toBe('old-access');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(queries[0]?.text).toContain('pg_advisory_xact_lock');
  });

  it('renews an expired token under the lock and stores the rotated refresh token', async () => {
    const { queries, sql } = fakeSql(chatgptRow(-1000));
    const fetchImpl = vi.fn(async () =>
      Response.json({ access_token: 'new-access', expires_in: 3600, refresh_token: 'new-refresh' }),
    );
    expect(await freshChatgptAccessToken(sql, KEY, fetchImpl, () => NOW)).toBe('new-access');
    const body = String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body);
    expect(body).toContain('grant_type=refresh_token');
    expect(body).toContain('refresh_token=old-refresh');
    const update = queries.find((query) => query.text.includes('UPDATE ai_provider_keys'));
    const stored = update?.values.filter((value): value is string => typeof value === 'string');
    expect(stored?.map((value) => decryptSecret(value, KEY))).toEqual([
      'new-access',
      'new-refresh',
    ]);
  });

  it('records the error and throws when OpenAI refuses the renewal', async () => {
    const { queries, sql } = fakeSql(chatgptRow(-1000));
    const fetchImpl = vi.fn(async () => Response.json({ error: 'invalid_grant' }, { status: 400 }));
    await expect(freshChatgptAccessToken(sql, KEY, fetchImpl, () => NOW)).rejects.toThrow(
      /invalid_grant/,
    );
    expect(queries.some((query) => query.text.includes('last_validation_error'))).toBe(true);
  });

  it('returns null when ChatGPT is not connected', async () => {
    const { sql } = fakeSql(undefined);
    expect(await freshChatgptAccessToken(sql, KEY, vi.fn(), () => NOW)).toBeNull();
  });
});
