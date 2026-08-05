'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { api } from '@/lib/api/client';

interface VoicePreferenceContextValue {
  error: string;
  isSaving: boolean;
  voiceName: string | null;
  setVoiceName: (voiceName: string | null) => Promise<void>;
  reviewNarrationEnabled: boolean;
  setReviewNarrationEnabled: (enabled: boolean) => Promise<void>;
}

const VoicePreferenceContext = createContext<VoicePreferenceContextValue>({
  error: '',
  isSaving: false,
  reviewNarrationEnabled: false,
  setReviewNarrationEnabled: async () => {},
  setVoiceName: async () => {},
  voiceName: null,
});

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function VoicePreferenceProvider({ children }: { children: ReactNode }) {
  const [voiceName, setVoiceNameState] = useState<string | null>(null);
  const [reviewNarrationEnabled, setReviewNarrationEnabledState] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      const token = window.localStorage.getItem('xadrez.access_token');
      if (!token) return;
      api
        .getMe(token)
        .then((user) => {
          setVoiceNameState(user.profile.voiceName);
          setReviewNarrationEnabledState(user.profile.reviewNarrationEnabled);
        })
        .catch(() => setError('Não foi possível carregar as preferências de voz.'));
    });
  }, []);

  const setVoiceName = useCallback(
    async (next: string | null) => {
      if (isSaving || next === voiceName) return;
      const previous = voiceName;
      setError('');
      setIsSaving(true);
      setVoiceNameState(next);
      const token = window.localStorage.getItem('xadrez.access_token');
      if (!token) {
        setVoiceNameState(previous);
        setError('Entre na sua conta para salvar a voz.');
        setIsSaving(false);
        return;
      }
      try {
        const user = await api.updateMe({ voiceName: next }, token);
        setVoiceNameState(user.profile.voiceName);
      } catch (saveError) {
        setVoiceNameState(previous);
        setError(errorMessage(saveError, 'Não foi possível salvar a voz.'));
      } finally {
        setIsSaving(false);
      }
    },
    [isSaving, voiceName],
  );

  const setReviewNarrationEnabled = useCallback(
    async (next: boolean) => {
      if (isSaving || next === reviewNarrationEnabled) return;
      const previous = reviewNarrationEnabled;
      setError('');
      setIsSaving(true);
      setReviewNarrationEnabledState(next);
      const token = window.localStorage.getItem('xadrez.access_token');
      if (!token) {
        setReviewNarrationEnabledState(previous);
        setError('Entre na sua conta para salvar a narração.');
        setIsSaving(false);
        return;
      }
      try {
        const user = await api.updateMe({ reviewNarrationEnabled: next }, token);
        setReviewNarrationEnabledState(user.profile.reviewNarrationEnabled);
      } catch (saveError) {
        setReviewNarrationEnabledState(previous);
        setError(errorMessage(saveError, 'Não foi possível salvar a narração.'));
      } finally {
        setIsSaving(false);
      }
    },
    [isSaving, reviewNarrationEnabled],
  );

  return (
    <VoicePreferenceContext.Provider
      value={{
        error,
        isSaving,
        reviewNarrationEnabled,
        setReviewNarrationEnabled,
        setVoiceName,
        voiceName,
      }}
    >
      {children}
    </VoicePreferenceContext.Provider>
  );
}

export function useVoicePreference(): VoicePreferenceContextValue {
  return useContext(VoicePreferenceContext);
}
