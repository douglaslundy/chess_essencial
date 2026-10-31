'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { useBoardMode, type BoardEffects } from '@/lib/board-mode';

const EFFECT_LABELS: Array<[keyof BoardEffects, string, string]> = [
  ['moveToast', 'Balão da jogada', 'Mostra a anotação do lance por 2 segundos.'],
  ['moveAnimation', 'Animação de movimento', 'A peça caminha casa a casa até o destino.'],
  ['captureAnimation', 'Animação de captura', 'Duelo com o poder de cada peça e som.'],
];

/** Non-modal popover in the top bar: board options never cover or shift the board. */
export function BoardSettingsMenu() {
  const { effects, mode, setEffect, setMode } = useBoardMode();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="boardSettings" ref={root}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className="boardModeToggle"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span aria-hidden="true">⚙</span> Tabuleiro
      </button>
      {open ? (
        <div
          aria-label="Opções do tabuleiro"
          className="boardSettingsPanel"
          id={panelId}
          role="group"
        >
          <label>
            <input
              checked={mode === '3d'}
              onChange={(event) => setMode(event.target.checked ? '3d' : '2d')}
              role="switch"
              type="checkbox"
            />
            <span>
              <b>Tabuleiro 3D</b>
              <small>Girar, inclinar e aproximar o tabuleiro.</small>
            </span>
          </label>
          {EFFECT_LABELS.map(([key, label, hint]) => (
            <label key={key}>
              <input
                checked={effects[key]}
                onChange={(event) => setEffect(key, event.target.checked)}
                role="switch"
                type="checkbox"
              />
              <span>
                <b>{label}</b>
                <small>{hint}</small>
              </span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
