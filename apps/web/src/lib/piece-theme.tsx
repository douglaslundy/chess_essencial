'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { api } from '@/lib/api/client';
import type { PieceTheme } from '@/components/game/chess-board';

interface PieceThemeContextValue {
  error: string;
  isSaving: boolean;
  theme: PieceTheme;
  setTheme: (theme: PieceTheme) => Promise<void>;
}

const PieceThemeContext = createContext<PieceThemeContextValue>({
  error: '',
  isSaving: false,
  setTheme: async () => {},
  theme: 'classic',
});

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function PieceThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<PieceTheme>('classic');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      const token = window.localStorage.getItem('xadrez.access_token');
      if (!token) return;
      api
        .getMe(token)
        .then((user) => setThemeState(user.profile.boardTheme))
        .catch(() => setError('Não foi possível carregar o tema salvo.'));
    });
  }, []);

  const setTheme = useCallback(
    async (next: PieceTheme) => {
      if (isSaving || next === theme) return;
      const previous = theme;
      setError('');
      setIsSaving(true);
      setThemeState(next);
      const token = window.localStorage.getItem('xadrez.access_token');
      if (!token) {
        setThemeState(previous);
        setError('Entre na sua conta para salvar o tema.');
        setIsSaving(false);
        return;
      }
      try {
        const user = await api.updateMe({ boardTheme: next }, token);
        setThemeState(user.profile.boardTheme);
      } catch (saveError) {
        setThemeState(previous);
        setError(errorMessage(saveError, 'Não foi possível salvar o tema do tabuleiro.'));
      } finally {
        setIsSaving(false);
      }
    },
    [isSaving, theme],
  );

  return (
    <PieceThemeContext.Provider value={{ error, isSaving, setTheme, theme }}>
      {children}
    </PieceThemeContext.Provider>
  );
}

export function usePieceTheme(): PieceThemeContextValue {
  return useContext(PieceThemeContext);
}
