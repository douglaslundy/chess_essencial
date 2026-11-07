'use client';

import { useRef } from 'react';

import { LibraryStudyRoom } from '@/components/library/library-study-room';
import { useDialogA11y } from '@/components/ui/dialog-a11y';

/** A library game opened in a modal over the current page; reaching its last move marks it done. */
export function LibraryGameDialog({
  gameId,
  onClose,
  onFinished,
  title,
}: {
  gameId: string;
  onClose: () => void;
  onFinished: () => void;
  title: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogA11y({ initialFocusRef: closeRef, onCancel: onClose, open: true });
  return (
    <div className="dialogBackdrop" role="presentation">
      <div
        aria-label={`Partida: ${title}`}
        aria-modal="true"
        className="studyDialog studyDialogWide"
        role="dialog"
      >
        <header className="studyDialogHeader">
          <h2>{title}</h2>
          <button onClick={onClose} ref={closeRef} type="button">
            Fechar
          </button>
        </header>
        <LibraryStudyRoom gameId={gameId} onFinished={onFinished} />
      </div>
    </div>
  );
}
