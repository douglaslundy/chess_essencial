import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ApiProblem,
  api,
  establishWebSession,
  getRealtimeAccessToken,
  getStoredUserId,
} from './client';

function localStorageWith(values: Record<string, string>) {
  const storage = new Map(Object.entries(values));
  return {
    getItem: (key: string) => storage.get(key) ?? null,
    removeItem: (key: string) => storage.delete(key),
    setItem: (key: string, value: string) => storage.set(key, value),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('API session refresh', () => {
  it('rotates the session once and retries a request rejected with 401', async () => {
    const localStorage = localStorageWith({
      'xadrez.access_token': 'expired-access',
      'xadrez.refresh_token': 'current-refresh',
    });
    vi.stubGlobal('window', { dispatchEvent: vi.fn(), localStorage });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'expired' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 401,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: 'fresh-access',
            accessTokenExpiresIn: 900,
            refreshToken: 'fresh-refresh',
            refreshTokenExpiresIn: 86400,
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'game-id' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.getGame('game-id', 'expired-access')).resolves.toMatchObject({
      id: 'game-id',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(localStorage.getItem('xadrez.access_token')).toBe('cookie-session-v1');
    expect(localStorage.getItem('xadrez.refresh_token')).toBeNull();
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ credentials: 'include' });
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      'X-Xadrez-Client': 'web',
      'X-Xadrez-CSRF': '1',
    });
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer fresh-access',
    });
  });

  it('clears an invalid session and preserves the original API problem', async () => {
    const localStorage = localStorageWith({
      'xadrez.access_token': 'expired-access',
      'xadrez.refresh_token': 'invalid-refresh',
      'xadrez.username': 'player',
    });
    vi.stubGlobal('window', { dispatchEvent: vi.fn(), localStorage });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ detail: 'expired' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 401,
          }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 401 })),
    );

    await expect(api.getGame('game-id', 'expired-access')).rejects.toBeInstanceOf(ApiProblem);
    expect(localStorage.getItem('xadrez.access_token')).toBeNull();
    expect(localStorage.getItem('xadrez.refresh_token')).toBeNull();
    expect(localStorage.getItem('xadrez.username')).toBeNull();
  });

  it('provides a refreshed token to realtime after HTTP rotated the session', async () => {
    const localStorage = localStorageWith({
      'xadrez.access_token': 'stale-access',
      'xadrez.refresh_token': 'current-refresh',
    });
    vi.stubGlobal('window', { atob, dispatchEvent: vi.fn(), localStorage });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            accessToken: 'fresh-realtime-access',
            accessTokenExpiresIn: 900,
            refreshToken: 'fresh-refresh',
            refreshTokenExpiresIn: 86400,
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 200 },
        ),
      ),
    );

    await expect(getRealtimeAccessToken(true)).resolves.toBe('fresh-realtime-access');
    expect(localStorage.getItem('xadrez.access_token')).toBe('cookie-session-v1');
    expect(localStorage.getItem('xadrez.refresh_token')).toBeNull();
  });

  it('stores only a non-secret marker when a web login succeeds', () => {
    const localStorage = localStorageWith({});
    vi.stubGlobal('window', { dispatchEvent: vi.fn(), localStorage });

    establishWebSession(
      {
        accessToken: 'access-secret',
        accessTokenExpiresIn: 900,
        refreshToken: 'refresh-secret',
        refreshTokenExpiresIn: 86_400,
      },
      {
        email: 'player@example.com',
        emailVerifiedAt: null,
        id: 'player-id',
        profile: {
          avatarUrl: null,
          bio: null,
          birthDate: null,
          boardTheme: 'classic',
          countryCode: null,
          displayName: 'Player',
          isProfilePublic: true,
          locale: 'pt-BR',
          reviewNarrationEnabled: false,
          suggestMoveEnabled: false,
          timezone: 'America/Sao_Paulo',
          voiceName: null,
        },
        status: 'active',
        username: 'player',
      },
    );

    expect(localStorage.getItem('xadrez.access_token')).toBe('cookie-session-v1');
    expect(localStorage.getItem('xadrez.refresh_token')).toBeNull();
  });

  it('recovers the player id from the access token when older storage lacks it', () => {
    const payload = Buffer.from(JSON.stringify({ sub: 'player-id' })).toString('base64url');
    const localStorage = localStorageWith({ 'xadrez.access_token': `header.${payload}.signature` });
    vi.stubGlobal('window', { atob, dispatchEvent: vi.fn(), localStorage });

    expect(getStoredUserId()).toBe('player-id');
    expect(localStorage.getItem('xadrez.user_id')).toBe('player-id');
  });
});

describe('API request headers', () => {
  it('does not advertise a JSON body for an empty resignation request', async () => {
    const localStorage = localStorageWith({ 'xadrez.access_token': 'access-token' });
    vi.stubGlobal('window', { dispatchEvent: vi.fn(), localStorage });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'game-id', status: 'completed' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await api.resign('game-id', 'access-token');

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
    expect(init.headers).not.toHaveProperty('Content-Type');
  });
});
