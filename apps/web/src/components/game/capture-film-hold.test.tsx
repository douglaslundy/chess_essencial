// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChessBoard } from './chess-board';
import { BoardModeProvider } from '@/lib/board-mode';

vi.mock('next/dynamic', () => ({
  default: () =>
    function Film({ onClose }: { onClose?: () => void }) {
      return createElement('button', { onClick: onClose, type: 'button' }, 'pular');
    },
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const board = (fen: string): ReactNode =>
  createElement(
    BoardModeProvider,
    null,
    createElement(ChessBoard, { fen, onMove: () => undefined, orientation: 'white' }),
  );

describe('capture film', () => {
  it("holds the opponent's reply until the film is skipped", async () => {
    window.localStorage.setItem('xadrez.board_effects', JSON.stringify({ captureAnimation: true }));
    const view = render(board('4k3/8/8/3n4/8/8/8/3QK3 w - - 0 1'));
    await act(async () => undefined);
    view.rerender(board('4k3/8/8/3Q4/8/8/8/4K3 b - - 0 1'));
    expect(screen.getByRole('gridcell', { name: /d5, branco dama/i })).toBeTruthy();
    view.rerender(board('5k2/8/8/3Q4/8/8/8/4K3 w - - 1 2'));
    expect(screen.getByRole('gridcell', { name: /e8, preto rei/i })).toBeTruthy();
    fireEvent.click(screen.getByText('pular'));
    expect(screen.getByRole('gridcell', { name: /f8, preto rei/i })).toBeTruthy();
    expect(screen.queryByText('pular')).toBeNull();
  });
});
