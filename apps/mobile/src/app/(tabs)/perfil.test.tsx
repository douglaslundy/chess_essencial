import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import PerfilScreen from './perfil';
import { useAuth } from '@/lib/auth/auth-context';

jest.mock('@/lib/auth/auth-context', () => ({ useAuth: jest.fn() }));

const mockedUseAuth = jest.mocked(useAuth);
const user = {
  email: 'jogador@example.com',
  emailVerifiedAt: null,
  id: '99000000-0000-4000-8000-000000000040',
  profile: {
    avatarUrl: null,
    bio: null,
    birthDate: null,
    boardTheme: 'classic' as const,
    countryCode: null,
    displayName: 'Jogador',
    isProfilePublic: true,
    locale: 'pt-BR',
    reviewNarrationEnabled: false,
    suggestMoveEnabled: false,
    timezone: 'America/Sao_Paulo',
    voiceName: null,
  },
  status: 'active' as const,
  username: 'jogador',
};

describe('PerfilScreen preferences', () => {
  const logout = jest.fn(async () => {});
  const updateProfile = jest.fn(async () => {});

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({
      isLoading: false,
      login: jest.fn(async () => {}),
      logout,
      updateProfile,
      user,
    });
  });

  it('exposes the shared profile visibility preference accessibly', async () => {
    await render(<PerfilScreen />);

    const toggle = screen.getByTestId('profile-public-switch');
    expect(toggle.props).toMatchObject({
      accessibilityHint: 'Altera a visibilidade do perfil em todos os dispositivos.',
      accessibilityLabel: 'Perfil público',
      accessibilityRole: 'switch',
      accessibilityState: { checked: true },
      value: true,
    });

    await act(async () => {
      fireEvent(toggle, 'valueChange', false);
      await Promise.resolve();
    });
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ isProfilePublic: false }));
  });

  it('shows a persistence failure instead of silently keeping the optimistic state', async () => {
    updateProfile.mockRejectedValueOnce(new Error('Falha ao salvar privacidade.'));
    await render(<PerfilScreen />);

    await act(async () => {
      fireEvent(screen.getByTestId('profile-public-switch'), 'valueChange', false);
      await Promise.resolve();
    });

    expect(await screen.findByText('Falha ao salvar privacidade.')).toBeTruthy();
  });
});
