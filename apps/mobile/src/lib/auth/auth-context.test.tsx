import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Pressable, Text } from 'react-native';

import type { PublicUser } from '@xadrez/contracts';

import { ApiProblem } from '@/lib/api/client';
import { AuthProvider, useAuth } from '@/lib/auth/auth-context';

jest.mock('@/lib/api/client', () => {
  class ApiProblem extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return {
    api: { getMe: jest.fn(), login: jest.fn(), logout: jest.fn(), updateMe: jest.fn() },
    ApiProblem,
  };
});

jest.mock('@/lib/api/session', () => ({
  clearSession: jest.fn(),
  getAccessToken: jest.fn(),
  getRefreshToken: jest.fn(),
  saveSession: jest.fn(),
}));

const { api: rawApi } = jest.requireMock<typeof import('@/lib/api/client')>('@/lib/api/client');
const api = jest.mocked(rawApi, { shallow: true });
const session = jest.mocked(
  jest.requireMock<typeof import('@/lib/api/session')>('@/lib/api/session'),
  { shallow: true },
);

function buildUser(overrides: Partial<PublicUser> = {}): PublicUser {
  return {
    email: 'jogador@example.com',
    emailVerifiedAt: null,
    id: '99000000-0000-4000-8000-000000000040',
    profile: {
      avatarUrl: null,
      bio: null,
      birthDate: null,
      boardTheme: 'classic',
      countryCode: null,
      displayName: 'Jogador Um',
      isProfilePublic: true,
      locale: 'pt-BR',
      reviewNarrationEnabled: true,
      suggestMoveEnabled: true,
      timezone: 'America/Sao_Paulo',
      voiceName: null,
    },
    status: 'active',
    username: 'jogador_um',
    ...overrides,
  };
}

function TestConsumer() {
  const { isLoading, login, logout, updateProfile, user } = useAuth();
  return (
    <>
      <Text>{isLoading ? 'loading' : 'loaded'}</Text>
      <Text>{user ? user.username : 'anonymous'}</Text>
      <Text>{user?.profile.isProfilePublic ? 'public-profile' : 'private-profile'}</Text>
      <Pressable
        onPress={() => login({ identifier: 'jogador@example.com', password: 'segredo123' })}
        testID="login"
      />
      <Pressable onPress={() => logout()} testID="logout" />
      <Pressable
        onPress={() => updateProfile({ isProfilePublic: false }).catch(() => undefined)}
        testID="make-private"
      />
    </>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('finishes loading with no user when there is no stored session', async () => {
    session.getAccessToken.mockResolvedValue(null);
    await render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await screen.findByText('loaded');
    expect(screen.getByText('anonymous')).toBeTruthy();
    expect(api.getMe).not.toHaveBeenCalled();
  });

  it('restores the session by fetching the current user when a token is stored', async () => {
    session.getAccessToken.mockResolvedValue('stored-token');
    api.getMe.mockResolvedValue(buildUser());

    await render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await screen.findByText('jogador_um');
    expect(api.getMe).toHaveBeenCalledWith('stored-token');
  });

  it('clears the session when the stored token is rejected as unauthorized', async () => {
    session.getAccessToken.mockResolvedValue('expired-token');
    api.getMe.mockRejectedValue(new ApiProblem(401, 'Sessão expirada'));

    await render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await screen.findByText('loaded');
    expect(screen.getByText('anonymous')).toBeTruthy();
    expect(session.clearSession).toHaveBeenCalled();
  });

  it('logs in, storing the session and exposing the returned user', async () => {
    session.getAccessToken.mockResolvedValue(null);
    const tokens = {
      accessToken: 'new-access',
      accessTokenExpiresIn: 900,
      refreshToken: 'new-refresh',
      refreshTokenExpiresIn: 2_592_000,
    };
    api.login.mockResolvedValue({ tokens, user: buildUser({ username: 'jogador_dois' }) });

    await render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );
    await screen.findByText('anonymous');

    await fireEvent.press(screen.getByTestId('login'));

    await screen.findByText('jogador_dois');
    expect(api.login).toHaveBeenCalledWith({
      identifier: 'jogador@example.com',
      password: 'segredo123',
    });
    expect(session.saveSession).toHaveBeenCalledWith(tokens);
  });

  it('logs out, clearing the session and the current user', async () => {
    session.getAccessToken.mockResolvedValue('stored-token');
    session.getRefreshToken.mockResolvedValue('stored-refresh');
    api.getMe.mockResolvedValue(buildUser());
    api.logout.mockResolvedValue(undefined);

    await render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );
    await screen.findByText('jogador_um');

    await fireEvent.press(screen.getByTestId('logout'));

    await screen.findByText('anonymous');
    expect(api.logout).toHaveBeenCalledWith('stored-refresh');
    expect(session.clearSession).toHaveBeenCalled();
  });

  it('reverts an optimistic profile preference when persistence fails', async () => {
    session.getAccessToken.mockResolvedValue('stored-token');
    api.getMe.mockResolvedValue(buildUser());
    let rejectUpdate: ((error: Error) => void) | undefined;
    api.updateMe.mockReturnValue(
      new Promise((_, reject) => {
        rejectUpdate = reject;
      }),
    );

    await render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );
    await screen.findByText('public-profile');

    await act(async () => {
      fireEvent.press(screen.getByTestId('make-private'));
      await Promise.resolve();
    });
    await screen.findByText('private-profile');
    await act(async () => {
      rejectUpdate?.(new Error('Falha ao salvar privacidade.'));
      await Promise.resolve();
    });

    await screen.findByText('public-profile');
    expect(api.updateMe).toHaveBeenCalledWith({ isProfilePublic: false }, 'stored-token');
  });
});
