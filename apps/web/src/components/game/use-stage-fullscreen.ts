'use client';

import { useCallback, useEffect, useState, type RefObject } from 'react';

/**
 * Board fullscreen. Uses the Fullscreen API when the browser has it; iPhone Safari only allows
 * it for video, so there the stage is pinned over the page instead (same look, Esc/F still exit).
 */
export function useStageFullscreen(stage: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const sync = () => setActive(document.fullscreenElement === stage.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, [stage]);

  const toggle = useCallback(() => {
    const node = stage.current;
    if (!node) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (active) {
      setActive(false);
      return;
    }
    if (typeof node.requestFullscreen === 'function') {
      node.requestFullscreen().catch(() => setActive(true));
    } else {
      setActive(true);
    }
  }, [active, stage]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (event.key === 'f' || event.key === 'F') toggle();
      // Native fullscreen handles Esc itself; the pinned fallback needs it here.
      else if (event.key === 'Escape' && active && !document.fullscreenElement) setActive(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, toggle]);

  return { active, toggle };
}
