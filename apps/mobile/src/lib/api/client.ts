import type {
  LoginInput,
  PublicUser,
  RegisterInput,
  ResendVerificationInput,
  TokenPair,
} from '@xadrez/contracts';

import { mobileEnv } from '@/lib/env';
import { clearSession, getAccessToken, getRefreshToken, saveSession } from '@/lib/api/session';

export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function authHeaders(token?: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function fetchApi(path: string, token?: string, init?: RequestInit) {
  return fetch(mobileEnv.EXPO_PUBLIC_API_URL + path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body === undefined || init.body === null
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...authHeaders(token),
      ...init?.headers,
    },
  });
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshStoredSession(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return null;
    try {
      const response = await fetchApi('/auth/refresh', undefined, {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) {
        await clearSession();
        return null;
      }
      const tokens = (await response.json()) as TokenPair;
      await saveSession(tokens);
      return tokens.accessToken;
    } catch {
      await clearSession();
      return null;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export async function getRealtimeAccessToken(forceRefresh = false): Promise<string | null> {
  if (!forceRefresh) {
    const token = await getAccessToken();
    if (token) return token;
  }
  return refreshStoredSession();
}

async function responseWithRefresh(path: string, token?: string, init?: RequestInit) {
  const storedAccessToken = token ? await getAccessToken() : null;
  const isStoredAccessToken = Boolean(token) && token === storedAccessToken;
  let response = await fetchApi(path, token, init);

  if (response.status === 401 && isStoredAccessToken) {
    const refreshedToken = await refreshStoredSession();
    if (refreshedToken) response = await fetchApi(path, refreshedToken, init);
  }
  return response;
}

async function request<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const response = await responseWithRefresh(path, token, init);
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new ApiProblem(
      response.status,
      problem?.detail ?? 'Não foi possível concluir a operação.',
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  register: (input: RegisterInput) =>
    request<{ emailSent: boolean; user: PublicUser; verificationToken?: string }>(
      '/auth/register',
      undefined,
      { method: 'POST', body: JSON.stringify(input) },
    ),
  resendVerification: (input: ResendVerificationInput) =>
    request<void>('/auth/resend-verification', undefined, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  login: (input: LoginInput) =>
    request<{ tokens: TokenPair; user: PublicUser }>('/auth/login', undefined, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  logout: (refreshToken: string) =>
    request<void>('/auth/logout', undefined, {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),
  getMe: (token: string) => request<PublicUser>('/me', token),
};
