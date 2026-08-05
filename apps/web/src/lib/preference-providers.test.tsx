// @vitest-environment jsdom
import type { PublicUser } from '@xadrez/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api/client';
import { PieceThemeProvider, usePieceTheme } from '@/lib/piece-theme';
import { VoicePreferenceProvider, useVoicePreference } from '@/lib/voice-preference';

vi.mock('@/lib/api/client', () => ({ api: { getMe: vi.fn(), updateMe: vi.fn() } }));

const mockedApi = vi.mocked(api);

function user(overrides: Partial<PublicUser['profile']> = {}): PublicUser {
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
      displayName: 'Jogador',
      isProfilePublic: true,
      locale: 'pt-BR',
      reviewNarrationEnabled: false,
      suggestMoveEnabled: false,
      timezone: 'America/Sao_Paulo',
      voiceName: 'Luciana',
      ...overrides,
    },
    status: 'active',
    username: 'jogador',
  };
}

function ThemeConsumer() {
  const { error, isSaving, setTheme, theme } = usePieceTheme();
  return (
    <>
      <span>{theme}</span>
      <span>{isSaving ? 'saving-theme' : 'idle-theme'}</span>
      {error ? <span role="alert">{error}</span> : null}
      <button onClick={() => void setTheme('wood')} type="button">
        Madeira
      </button>
    </>
  );
}

function VoiceConsumer() {
  const {
    error,
    isSaving,
    reviewNarrationEnabled,
    setReviewNarrationEnabled,
    setVoiceName,
    voiceName,
  } = useVoicePreference();
  return (
    <>
      <span>{voiceName ?? 'default-voice'}</span>
      <span>{reviewNarrationEnabled ? 'narration-on' : 'narration-off'}</span>
      <span>{isSaving ? 'saving-voice' : 'idle-voice'}</span>
      {error ? <span role="alert">{error}</span> : null}
      <button onClick={() => void setVoiceName('Maria')} type="button">
        Maria
      </button>
      <button onClick={() => void setReviewNarrationEnabled(true)} type="button">
        Narrar
      </button>
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.setItem('xadrez.access_token', 'token');
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('preference providers', () => {
  it('reverts an optimistic board theme and exposes the save failure', async () => {
    mockedApi.getMe.mockResolvedValue(user());
    mockedApi.updateMe.mockRejectedValue(new Error('Falha de rede ao salvar tema.'));
    render(
      <PieceThemeProvider>
        <ThemeConsumer />
      </PieceThemeProvider>,
    );
    await screen.findByText('classic');

    fireEvent.click(screen.getByRole('button', { name: 'Madeira' }));

    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toBe('Falha de rede ao salvar tema.');
    expect(screen.getByText('classic')).toBeTruthy();
    expect(screen.getByText('idle-theme')).toBeTruthy();
  });

  it('reverts an optimistic voice and reports the persistence failure', async () => {
    mockedApi.getMe.mockResolvedValue(user());
    mockedApi.updateMe.mockRejectedValue(new Error('Falha de rede ao salvar voz.'));
    render(
      <VoicePreferenceProvider>
        <VoiceConsumer />
      </VoicePreferenceProvider>,
    );
    await screen.findByText('Luciana');

    fireEvent.click(screen.getByRole('button', { name: 'Maria' }));

    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toBe('Falha de rede ao salvar voz.');
    expect(screen.getByText('Luciana')).toBeTruthy();
    expect(screen.getByText('idle-voice')).toBeTruthy();
  });

  it('keeps the server-confirmed narration preference', async () => {
    mockedApi.getMe.mockResolvedValue(user());
    mockedApi.updateMe.mockResolvedValue(user({ reviewNarrationEnabled: true }));
    render(
      <VoicePreferenceProvider>
        <VoiceConsumer />
      </VoicePreferenceProvider>,
    );
    await screen.findByText('narration-off');

    fireEvent.click(screen.getByRole('button', { name: 'Narrar' }));

    await waitFor(() => expect(screen.getByText('narration-on')).toBeTruthy());
    expect(mockedApi.updateMe).toHaveBeenCalledWith({ reviewNarrationEnabled: true }, 'token');
  });
});
