'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type BoardMode = '2d' | '3d';

export interface BoardEffects {
  /** Fading move label ("Ce4") over the opponent's side of the board. On by default. */
  moveToast: boolean;
  /** The moved piece walks square by square to its destination. */
  moveAnimation: boolean;
  /** Cinematic duel (per-piece power + sound) when a piece is captured. */
  captureAnimation: boolean;
}

const STORAGE_KEY = 'xadrez.board_mode';
const EFFECTS_KEY = 'xadrez.board_effects';
const DEFAULT_EFFECTS: BoardEffects = {
  captureAnimation: false,
  moveAnimation: false,
  moveToast: true,
};

interface BoardModeValue {
  effects: BoardEffects;
  mode: BoardMode;
  setEffect: (key: keyof BoardEffects, value: boolean) => void;
  setMode: (mode: BoardMode) => void;
}

const BoardModeContext = createContext<BoardModeValue>({
  effects: DEFAULT_EFFECTS,
  mode: '2d',
  setEffect: () => undefined,
  setMode: () => undefined,
});

export function BoardModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<BoardMode>('2d');
  const [effects, setEffects] = useState<BoardEffects>(DEFAULT_EFFECTS);

  useEffect(() => {
    try {
      const storedMode = window.localStorage.getItem(STORAGE_KEY);
      const storedEffects = window.localStorage.getItem(EFFECTS_KEY);
      queueMicrotask(() => {
        if (storedMode === '3d') setModeState('3d');
        if (storedEffects)
          setEffects({
            ...DEFAULT_EFFECTS,
            ...(JSON.parse(storedEffects) as Partial<BoardEffects>),
          });
      });
    } catch {
      // Storage may be blocked or corrupt; the defaults still work.
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

  const setEffect = useCallback((key: keyof BoardEffects, value: boolean) => {
    setEffects((current) => {
      const next = { ...current, [key]: value };
      try {
        window.localStorage.setItem(EFFECTS_KEY, JSON.stringify(next));
      } catch {
        // Preference simply won't persist.
      }
      return next;
    });
  }, []);

  return (
    <BoardModeContext.Provider value={{ effects, mode, setEffect, setMode }}>
      {children}
    </BoardModeContext.Provider>
  );
}

export function useBoardMode() {
  return useContext(BoardModeContext);
}
