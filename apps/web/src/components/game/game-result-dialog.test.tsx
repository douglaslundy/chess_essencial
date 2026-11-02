// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { GameResultDialog, type GameResult } from './game-result-dialog';

afterEach(() => cleanup());

const result: GameResult = { outcome: 'win', reason: 'por xeque-mate' };

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        Abrir resultado
      </button>
      <GameResultDialog onClose={() => setOpen(false)} result={open ? result : null} />
    </>
  );
}

describe('GameResultDialog', () => {
  it('links to the game review when a review page is given', () => {
    render(
      <GameResultDialog
        onClose={() => undefined}
        result={result}
        reviewHref="/app/partidas/g1/revisao"
      />,
    );
    expect(screen.getByRole('link', { name: 'Revisar partida' }).getAttribute('href')).toBe(
      '/app/partidas/g1/revisao',
    );
  });

  it('focuses its close action when opened', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Abrir resultado' });
    trigger.focus();

    fireEvent.click(trigger);

    expect(screen.getByRole('dialog', { name: 'Você venceu!' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fechar' }));
  });

  it('closes with Escape and restores focus to the opener', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Abrir resultado' });
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
