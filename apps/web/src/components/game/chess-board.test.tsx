// @vitest-environment jsdom
import type { GameMove } from '@xadrez/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { boardSquares, ChessBoard } from './chess-board';
import { formatClock, formatMove } from './game-room';

afterEach(() => cleanup());

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

  it('renders visible coordinates and vector pieces with explicit colors', () => {
    const view = render(
      createElement(ChessBoard, {
        fen: '8/8/8/3p4/4P3/8/8/8 w - - 0 1',
        onMove: vi.fn(),
        orientation: 'white',
      }),
    );
    expect(view.container.querySelectorAll('.boardFiles').length).toBe(2);
    expect(view.container.querySelectorAll('.boardRanks').length).toBe(2);
    const whitePawn = view.container.querySelector('.whitePiece');
    const blackPawn = view.container.querySelector('.blackPiece');
    expect(whitePawn?.tagName).toBe('svg');
    expect(whitePawn?.getAttribute('data-color')).toBe('w');
    expect(blackPawn?.getAttribute('data-color')).toBe('b');
    expect(whitePawn?.getAttribute('data-piece')).toBe('p');
    expect(blackPawn?.getAttribute('data-piece')).toBe('p');
    expect(whitePawn?.querySelectorAll('path').length).toBe(
      blackPawn?.querySelectorAll('path').length,
    );
  });

  it('does not select a piece outside the allowed player color', () => {
    const view = render(
      createElement(ChessBoard, {
        fen: '8/8/8/3p4/4P3/8/8/8 w - - 0 1',
        movableColor: 'w',
        onMove: vi.fn(),
        orientation: 'white',
      }),
    );
    fireEvent.click(view.container.querySelector('[aria-label="d5, preto peão"]')!);
    expect(view.container.querySelector('.selectedSquare')).toBeNull();
  });

  it('renders an illustrative diagram even when the FEN is not a legal game state', () => {
    const onMove = vi.fn();
    const view = render(
      createElement(ChessBoard, {
        fen: '8/8/8/3q4/4P3/8/8/8 w - - 0 1',
        onMove,
        orientation: 'white',
      }),
    );

    const queen = view.container.querySelector('[aria-label="d5, preto dama"]');
    const pawn = view.container.querySelector('[aria-label="e4, branco peão"]');
    const destination = view.container.querySelector('[aria-label="e5, vazia"]');
    expect(queen).toBeTruthy();
    expect(pawn).toBeTruthy();
    fireEvent.click(pawn!);
    fireEvent.click(destination!);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('formats clocks without displaying negative time', () => {
    expect(formatClock(61000)).toBe('1:01');
    expect(formatClock(-10)).toBe('0:00');
  });

  it('makes SAN notation explicit for beginners', () => {
    expect(formatMove({ san: 'Nh3', from: 'f2', to: 'h3' } as GameMove)).toBe('Nh3 · cavalo f2→h3');
  });

  it('renders classic SVG pieces by default', () => {
    render(
      createElement(ChessBoard, {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        onMove: vi.fn(),
        orientation: 'white',
      }),
    );
    expect(document.querySelectorAll('svg.chessPiece').length).toBe(32);
    expect(document.querySelectorAll('img.pieceImage').length).toBe(0);
  });

  it('renders Staunton 3D pieces as images when pieceTheme is staunton_3d', () => {
    render(
      createElement(ChessBoard, {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        onMove: vi.fn(),
        orientation: 'white',
        pieceTheme: 'staunton_3d',
      }),
    );
    const images = document.querySelectorAll<HTMLImageElement>('img.pieceImage');
    expect(images.length).toBe(32);
    expect(images[0]?.src).toContain('/piece-themes/staunton-3d/');
  });

  it('renders wood SVG pieces when pieceTheme is wood', () => {
    render(
      createElement(ChessBoard, {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        onMove: vi.fn(),
        orientation: 'white',
        pieceTheme: 'wood',
      }),
    );
    expect(document.querySelectorAll('svg.woodPiece').length).toBe(32);
  });
});
