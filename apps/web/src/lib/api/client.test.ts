import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiProblem, api } from './client';

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
    expect(localStorage.getItem('xadrez.access_token')).toBe('fresh-access');
    expect(localStorage.getItem('xadrez.refresh_token')).toBe('fresh-refresh');
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
});
