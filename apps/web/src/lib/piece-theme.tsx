'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { api } from '@/lib/api/client';
import type { PieceTheme } from '@/components/game/chess-board';

interface PieceThemeContextValue {
  theme: PieceTheme;
  setTheme: (theme: PieceTheme) => void;
}

const PieceThemeContext = createContext<PieceThemeContextValue>({
  setTheme: () => {},
  theme: 'classic',
});

export function PieceThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<PieceTheme>('classic');

  useEffect(() => {
    queueMicrotask(() => {
      const token = window.localStorage.getItem('xadrez.access_token');
      if (!token) return;
      api
        .getMe(token)
        .then((user) => setThemeState(user.profile.boardTheme))
        .catch(() => undefined);
    });
  }, []);

  const setTheme = useCallback((next: PieceTheme) => {
    setThemeState(next);
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    void api.updateMe({ boardTheme: next }, token).catch(() => undefined);
  }, []);

  return (
    <PieceThemeContext.Provider value={{ setTheme, theme }}>{children}</PieceThemeContext.Provider>
  );
}

export function usePieceTheme(): PieceThemeContextValue {
  return useContext(PieceThemeContext);
}
