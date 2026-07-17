// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { boardSquares, ChessBoard } from './chess-board';
import { formatClock } from './game-room';

describe('ChessBoard', () => {
  it('keeps the expected orientation on desktop and mobile layouts', () => {
    expect(boardSquares('white').slice(0, 2)).toEqual(['a8', 'b8']);
    expect(boardSquares('black').slice(0, 2)).toEqual(['h1', 'g1']);
  });

  it('submits a legal move with click interaction', () => {
    const onMove = vi.fn();
    render(
      createElement(ChessBoard, {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        onMove,
        orientation: 'white',
      }),
    );
    fireEvent.click(screen.getByRole('gridcell', { name: /e2, branco peão/i }));
    fireEvent.click(screen.getByRole('gridcell', { name: /e4, vazia/i }));
    expect(onMove).toHaveBeenCalledWith('e2e4');
  });

  it('formats clocks without displaying negative time', () => {
    expect(formatClock(61000)).toBe('1:01');
    expect(formatClock(-10)).toBe('0:00');
  });
});
