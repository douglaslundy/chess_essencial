'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type BoardMode = '2d' | '3d';

const STORAGE_KEY = 'xadrez.board_mode';

const BoardModeContext = createContext<{ mode: BoardMode; setMode: (mode: BoardMode) => void }>({
  mode: '2d',
  setMode: () => undefined,
});

export function BoardModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<BoardMode>('2d');

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === '3d')
        queueMicrotask(() => setModeState('3d'));
    } catch {
      // Storage may be blocked; the default 2D board still works.
    }
  }, []);

  const setMode = useCallback((next: BoardMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preference simply won't persist.
    }
  }, []);

  return (
    <BoardModeContext.Provider value={{ mode, setMode }}>{children}</BoardModeContext.Provider>
  );
}

export function useBoardMode() {
  return useContext(BoardModeContext);
}
