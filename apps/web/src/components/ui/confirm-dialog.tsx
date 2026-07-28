'use client';

import { useId, useRef } from 'react';

import { useDialogA11y } from './dialog-a11y';

type ConfirmDialogProps = {
  busy?: boolean;
  cancelLabel?: string;
  confirmLabel: string;
  danger?: boolean;
  description: string;
  eyebrow?: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
};

export function ConfirmDialog({
  busy = false,
  cancelLabel = 'Cancelar',
  confirmLabel,
  danger = false,
  description,
  eyebrow,
  onCancel,
  onConfirm,
  open,
  title,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useDialogA11y({ busy, initialFocusRef: cancelButtonRef, onCancel, open });

  if (!open) return null;

  return (
    <div
      className="dialogBackdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !busy) onCancel();
      }}
      role="presentation"
    >
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="confirmationDialog"
        role="alertdialog"
      >
        <div className="dialogHeader">
          <div>
            {eyebrow ? <span className="dialogEyebrow">{eyebrow}</span> : null}
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            aria-label="Fechar"
            className="dialogClose"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            ×
          </button>
        </div>
        <p id={descriptionId}>{description}</p>
        <div className="dialogActions">
          <button disabled={busy} onClick={onCancel} ref={cancelButtonRef} type="button">
            {cancelLabel}
          </button>
          <button
            className={danger ? 'dangerAction dialogConfirm' : 'dialogConfirm'}
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {busy ? 'Aguarde…' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
