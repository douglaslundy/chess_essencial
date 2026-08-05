'use client';

import { useId, useRef } from 'react';

import { useDialogA11y } from '@/components/ui/dialog-a11y';

export type GameResult = {
  outcome: 'win' | 'loss' | 'draw';
  reason: string;
};

export function GameResultDialog({
  onClose,
  result,
}: {
  onClose: () => void;
  result: GameResult | null;
}) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useDialogA11y({
    initialFocusRef: closeButtonRef,
    onCancel: onClose,
    open: result !== null,
  });

  if (!result) return null;

  return (
    <div className="gameResultOverlay" role="presentation">
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={`gameResultDialog gameResult-${result.outcome}`}
        role="dialog"
      >
        <h2 id={titleId}>
          {result.outcome === 'win'
            ? 'Você venceu!'
            : result.outcome === 'loss'
              ? 'Você perdeu'
              : 'Empate'}
        </h2>
        <p>
          {result.outcome === 'win'
            ? `Vitória ${result.reason}.`
            : result.outcome === 'loss'
              ? `Derrota ${result.reason}.`
              : `Empate ${result.reason}.`}
        </p>
        <button className="gameResultAction" onClick={onClose} ref={closeButtonRef} type="button">
          Fechar
        </button>
      </div>
    </div>
  );
}
