'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';

import { useBoardMode, type BoardEffects } from '@/lib/board-mode';
import { getNarrationRate, NARRATION_RATES, setNarrationRate } from '@/lib/speech';

const EFFECT_LABELS: Array<[keyof BoardEffects, string, string]> = [
  ['moveToast', 'Balão da jogada', 'Mostra a anotação do lance por 2 segundos.'],
  ['moveAnimation', 'Animação de movimento', 'A peça caminha casa a casa até o destino.'],
  ['captureAnimation', 'Animação de captura', 'Duelo com o poder de cada peça e som.'],
  ['squareNames', 'Nome das casas', 'Mostra A1, B2… dentro das casas vazias (2D e 3D).'],
  [
    'greyLight3d',
    'Escurecer casas claras (3D)',
    'Casas claras em cinza para destacar as peças brancas.',
  ],
  ['coordinates3d', 'Coordenadas no 3D', 'Letras e números das casas na borda do tabuleiro.'],
  ['rimWhite', 'Contorno nas peças brancas (3D)', 'Linha bronze ao redor das peças brancas.'],
  ['rimBlack', 'Contorno nas peças pretas (3D)', 'Linha dourada ao redor das peças pretas.'],
];

/** Non-modal popover in the top bar: board options never cover or shift the board. */
export function BoardSettingsMenu() {
  const { effects, mode, setEffect, setMode } = useBoardMode();
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const [rate, setRate] = useState(1);
  const open = place !== null;
  const setOpen = (value: boolean) => {
    if (value) setRate(getNarrationRate());
    setPlace(value ? placement() : null);
  };
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Fixed and clamped to the viewport: anchored to the button on wide screens, never cut off on phones.
  function placement(): CSSProperties {
    const rect = root.current?.getBoundingClientRect();
    const margin = 12;
    const width = Math.min(304, window.innerWidth - margin * 2);
    const right = rect?.right ?? window.innerWidth - margin;
    const top = (rect?.bottom ?? 0) + 6;
    return {
      left: Math.max(margin, Math.min(right - width, window.innerWidth - width - margin)),
      // Taller than the screen: the panel scrolls inside instead of the page.
      maxHeight: window.innerHeight - top - margin,
      top,
      width,
    };
  }

  useEffect(() => {
    if (!open) return;
    // Only a press outside the menu closes it; the toggle button is inside and closes it itself.
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setPlace(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPlace(null);
    };
    // Phones resize while scrolling (the address bar hides), so a resize re-anchors instead of closing.
    const onResize = () => setPlace(placement());
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
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
        onClick={() => setOpen(!open)}
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
          style={place ?? undefined}
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
          {mode === '3d' ? (
            <fieldset className="boardStyleChoice">
              <legend>Estilo do tabuleiro 3D</legend>
              <label>
                <input
                  checked={!effects.medieval3d && !effects.ivory3d}
                  name={`${panelId}-style`}
                  onChange={() => {
                    setEffect('medieval3d', false);
                    setEffect('ivory3d', false);
                  }}
                  type="radio"
                />
                <span>Simples</span>
              </label>
              <label>
                <input
                  checked={effects.medieval3d && !effects.ivory3d}
                  name={`${panelId}-style`}
                  onChange={() => {
                    setEffect('ivory3d', false);
                    setEffect('medieval3d', true);
                  }}
                  type="radio"
                />
                <span>Medieval</span>
              </label>
              <label>
                <input
                  checked={effects.ivory3d}
                  name={`${panelId}-style`}
                  onChange={() => {
                    setEffect('medieval3d', false);
                    setEffect('ivory3d', true);
                  }}
                  type="radio"
                />
                <span>Marfim</span>
              </label>
            </fieldset>
          ) : null}
          <fieldset className="boardStyleChoice">
            <legend>Velocidade da narração</legend>
            {NARRATION_RATES.map((value) => (
              <label key={value}>
                <input
                  checked={rate === value}
                  name={`${panelId}-rate`}
                  onChange={() => {
                    setNarrationRate(value);
                    setRate(value);
                  }}
                  type="radio"
                />
                <span>{value === 1 ? '1x' : `${value.toFixed(1)}x`}</span>
              </label>
            ))}
          </fieldset>
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
