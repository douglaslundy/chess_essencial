import type { Sql } from 'postgres';

import { decryptSecret, encryptSecret } from '../config/secret-cipher.js';

// Mirrors apps/api/src/ai-providers/chatgpt-oauth.ts (refresh half only).
const TOKEN_URL = 'https://auth.openai.com/api/accounts/oauth/token';
/** Renew when less than this is left, so a narration never starts with a token about to die. */
export const CHATGPT_RENEW_MARGIN_MS = 5 * 60_000;
/**
 * Same key the API takes before renewing: OpenAI rotates the refresh token on every use, so two
 * concurrent renewals would leave one side with a revoked token.
 */
export const CHATGPT_REFRESH_LOCK = 'xadrez.chatgpt_oauth_refresh';

interface ChatgptRow {
  accessTokenExpiresAt: Date | null;
  encryptedApiKey: string | null;
  encryptedRefreshToken: string | null;
  oauthClientId: string | null;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * The ChatGPT access token, renewed first when it is expired or about to expire (the API renews it
 * on a timer too, but the worker must not depend on the API being up). Null when not connected.
 */
export async function freshChatgptAccessToken(
  sql: Sql,
  encryptionKey: string,
  fetchImpl: FetchLike = fetch,
  now: () => number = Date.now,
): Promise<string | null> {
  let refused: string | null = null;
  const token = await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${CHATGPT_REFRESH_LOCK}))`;
    // Re-read under the lock: the API may have just renewed it.
    const [row] = await tx<ChatgptRow[]>`
      SELECT encrypted_api_key AS "encryptedApiKey", encrypted_refresh_token AS "encryptedRefreshToken",
        access_token_expires_at AS "accessTokenExpiresAt", oauth_client_id AS "oauthClientId"
      FROM ai_provider_keys WHERE provider = 'chatgpt'
      FOR UPDATE
    `;
    if (!row?.encryptedApiKey) return null;
    const expiresAt = row.accessTokenExpiresAt?.getTime() ?? 0;
    if (expiresAt - now() > CHATGPT_RENEW_MARGIN_MS) {
      return decryptSecret(row.encryptedApiKey, encryptionKey);
    }
    if (!row.encryptedRefreshToken || !row.oauthClientId) {
      return decryptSecret(row.encryptedApiKey, encryptionKey);
    }

    const response = await fetchImpl(TOKEN_URL, {
      body: new URLSearchParams({
        client_id: row.oauthClientId,
        grant_type: 'refresh_token',
        refresh_token: decryptSecret(row.encryptedRefreshToken, encryptionKey),
      }).toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      error?: string;
      error_description?: string;
      expires_in?: number;
      refresh_token?: string;
    };
    if (!response.ok || !body.access_token) {
      const reason = `A OpenAI recusou renovar o acesso do ChatGPT (${response.status}): ${body.error_description ?? body.error ?? 'sem detalhes'}`;
      refused = reason;
      return null;
    }
    await tx`
      UPDATE ai_provider_keys SET
        encrypted_api_key = ${encryptSecret(body.access_token, encryptionKey)},
        encrypted_refresh_token = COALESCE(
          ${body.refresh_token ? encryptSecret(body.refresh_token, encryptionKey) : null},
          encrypted_refresh_token
        ),
        access_token_expires_at = ${new Date(now() + (body.expires_in ?? 3600) * 1000)},
        last_validated_at = now(),
        last_validation_error = NULL,
        updated_at = now()
      WHERE provider = 'chatgpt'
    `;
    return body.access_token;
  });
  if (refused) {
    // Outside the transaction, so the error the admin page shows is not rolled back.
    await sql`
      UPDATE ai_provider_keys SET last_validation_error = ${refused}, updated_at = now()
      WHERE provider = 'chatgpt'
    `;
    throw new Error(refused);
  }
  return token;
}
