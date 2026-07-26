import type { Friend, LeaderboardEntry, Post, RatingPool, TokenPair } from '@xadrez/contracts';

import { mobileEnv } from '@/lib/env';
import { clearSession, getAccessToken, getRefreshToken, saveSession } from '@/lib/api/session';

// Duplicated request/refresh plumbing from client.ts (kept self-contained so
// this file never collides with parallel work touching client.ts directly).
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

export const socialApi = {
  getLeaderboard: (pool: RatingPool, token: string) =>
    request<LeaderboardEntry[]>(`/ratings/${pool}/leaderboard?limit=100`, token),
  likePost: (postId: string, token: string) =>
    request<Post>(`/posts/${postId}/like`, token, { method: 'POST' }),
  listFeed: (token: string, before?: string) =>
    request<Post[]>(`/feed${before ? `?before=${encodeURIComponent(before)}` : ''}`, token),
  listFriends: (token: string) => request<Friend[]>('/friends', token),
  unlikePost: (postId: string, token: string) =>
    request<void>(`/posts/${postId}/like`, token, { method: 'DELETE' }),
};
