'use client';

import { useEffect, useRef, type RefObject } from 'react';

/** Escape-to-close + auto-focus + focus-restore for a backdrop modal — extracted from
 * ConfirmDialog so any hand-rolled dialog can share the same keyboard/focus behavior
 * instead of re-implementing it (and risking drift, like an Escape key that silently
 * does nothing). */
export function useDialogA11y({
  busy = false,
  initialFocusRef,
  onCancel,
  open,
}: {
  busy?: boolean;
  initialFocusRef: RefObject<HTMLElement | null>;
  onCancel: () => void;
  open: boolean;
}) {
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancelRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);
    initialFocusRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [busy, initialFocusRef, open]);
}
