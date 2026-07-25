'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { api } from '@/lib/api/client';

interface VoicePreferenceContextValue {
  voiceName: string | null;
  setVoiceName: (voiceName: string | null) => void;
  reviewNarrationEnabled: boolean;
  setReviewNarrationEnabled: (enabled: boolean) => void;
}

const VoicePreferenceContext = createContext<VoicePreferenceContextValue>({
  reviewNarrationEnabled: false,
  setReviewNarrationEnabled: () => {},
  setVoiceName: () => {},
  voiceName: null,
});

export function VoicePreferenceProvider({ children }: { children: ReactNode }) {
  const [voiceName, setVoiceNameState] = useState<string | null>(null);
  const [reviewNarrationEnabled, setReviewNarrationEnabledState] = useState(false);

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
        .catch(() => undefined);
    });
  }, []);

  const setVoiceName = useCallback((next: string | null) => {
    setVoiceNameState(next);
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    void api.updateMe({ voiceName: next }, token).catch(() => undefined);
  }, []);

  const setReviewNarrationEnabled = useCallback((next: boolean) => {
    setReviewNarrationEnabledState(next);
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    void api.updateMe({ reviewNarrationEnabled: next }, token).catch(() => undefined);
  }, []);

  return (
    <VoicePreferenceContext.Provider
      value={{ reviewNarrationEnabled, setReviewNarrationEnabled, setVoiceName, voiceName }}
    >
      {children}
    </VoicePreferenceContext.Provider>
  );
}

export function useVoicePreference(): VoicePreferenceContextValue {
  return useContext(VoicePreferenceContext);
}
