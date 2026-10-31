import { createHash, randomBytes } from 'node:crypto';

// Official OpenAI identity endpoints (https://auth.openai.com/.well-known/openid-configuration).
export const CHATGPT_OAUTH = {
  authorizeUrl: 'https://auth.openai.com/api/accounts/authorize',
  revokeUrl: 'https://auth.openai.com/api/accounts/oauth/revoke',
  tokenUrl: 'https://auth.openai.com/api/accounts/oauth/token',
};
/** chatgpt.tokens.use.direct is the scope that lets calls spend the account's ChatGPT plan. */
export const CHATGPT_PLAN_SCOPE = 'chatgpt.tokens.use.direct';
const SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'resource.invoke',
  CHATGPT_PLAN_SCOPE,
];
export const PENDING_TTL_MS = 10 * 60_000;

export interface PendingAuthorization {
  clientId: string;
  expiresAt: number;
  redirectUri: string;
  state: string;
  verifier: string;
}

export interface ChatgptTokens {
  accessToken: string;
  account: string | null;
  expiresAt: Date;
  refreshToken: string | null;
}

export class ChatgptOAuthError extends Error {}

const base64Url = (buffer: Buffer) => buffer.toString('base64url');

export function newPendingAuthorization(
  clientId: string,
  redirectUri: string,
): PendingAuthorization {
  return {
    clientId,
    expiresAt: Date.now() + PENDING_TTL_MS,
    redirectUri,
    state: base64Url(randomBytes(24)),
    verifier: base64Url(randomBytes(48)),
  };
}

export function authorizeUrlFor(pending: PendingAuthorization): string {
  const url = new URL(CHATGPT_OAUTH.authorizeUrl);
  url.search = new URLSearchParams({
    client_id: pending.clientId,
    code_challenge: base64Url(createHash('sha256').update(pending.verifier).digest()),
    code_challenge_method: 'S256',
    redirect_uri: pending.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    state: pending.state,
  }).toString();
  return url.toString();
}

/** E-mail from the id_token, for display only (the token itself came straight from OpenAI over TLS). */
function accountFromIdToken(idToken: unknown): string | null {
  if (typeof idToken !== 'string') return null;
  try {
    const payload = JSON.parse(
      Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString(),
    ) as {
      email?: string;
    };
    return payload.email ?? null;
  } catch {
    return null;
  }
}

async function tokenRequest(params: Record<string, string>): Promise<ChatgptTokens> {
  const response = await fetch(CHATGPT_OAUTH.tokenUrl, {
    body: new URLSearchParams(params).toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
    expires_in?: number;
    id_token?: string;
    refresh_token?: string;
    scope?: string;
  };
  if (!response.ok || !body.access_token) {
    throw new ChatgptOAuthError(
      `A OpenAI recusou a autorização (${response.status}): ${body.error_description ?? body.error ?? 'sem detalhes'}`,
    );
  }
  if (body.scope && !body.scope.split(' ').includes(CHATGPT_PLAN_SCOPE)) {
    throw new ChatgptOAuthError(
      'A conta entrou, mas não concedeu o uso do plano do ChatGPT (escopo chatgpt.tokens.use.direct).',
    );
  }
  return {
    accessToken: body.access_token,
    account: accountFromIdToken(body.id_token),
    expiresAt: new Date(Date.now() + (body.expires_in ?? 3600) * 1000),
    refreshToken: body.refresh_token ?? null,
  };
}

export function exchangeCode(pending: PendingAuthorization, code: string) {
  return tokenRequest({
    client_id: pending.clientId,
    code,
    code_verifier: pending.verifier,
    grant_type: 'authorization_code',
    redirect_uri: pending.redirectUri,
  });
}

/** Refresh tokens rotate: every refresh returns a new one that replaces the old. */
export function refreshTokens(clientId: string, refreshToken: string) {
  return tokenRequest({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}

export async function revokeRefreshToken(clientId: string, refreshToken: string) {
  await fetch(CHATGPT_OAUTH.revokeUrl, {
    body: new URLSearchParams({
      client_id: clientId,
      token: refreshToken,
      token_type_hint: 'refresh_token',
    }).toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}
