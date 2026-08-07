// @vitest-environment jsdom
import type { GameMove } from '@xadrez/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { boardSquares, ChessBoard } from './chess-board';
import { formatClock, formatMove, shouldCoachTurn } from './game-room';

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

  it('renders each king cross with the same-color class', () => {
    const view = render(
      createElement(ChessBoard, {
        fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1',
        onMove: vi.fn(),
        orientation: 'white',
      }),
    );
    const kings = view.container.querySelectorAll('[data-piece="k"]');
    expect(kings).toHaveLength(2);
    expect(kings[0]?.querySelector('.kingCross')).toBeTruthy();
    expect(kings[1]?.querySelector('.kingCross')).toBeTruthy();
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

  it('keeps horizontal arrow navigation inside the current rank', () => {
    render(
      createElement(ChessBoard, {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        onMove: vi.fn(),
        orientation: 'white',
      }),
    );
    const h8 = screen.getByRole('gridcell', { name: 'h8, preto torre' });
    const a8 = screen.getByRole('gridcell', { name: 'a8, preto torre' });

    h8.focus();
    fireEvent.keyDown(h8, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(h8);

    a8.focus();
    fireEvent.keyDown(a8, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(a8);

    fireEvent.keyDown(a8, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('gridcell', { name: 'b8, preto cavalo' }));
  });

  it('focuses the promotion dialog, closes it with Escape and restores board focus', () => {
    render(
      createElement(ChessBoard, {
        fen: 'k7/4P3/8/8/8/8/8/4K3 w - - 0 1',
        onMove: vi.fn(),
        orientation: 'white',
      }),
    );
    const pawn = screen.getByRole('gridcell', { name: 'e7, branco peão' });
    const destination = screen.getByRole('gridcell', { name: 'e8, vazia' });
    pawn.focus();
    fireEvent.click(pawn);
    fireEvent.click(destination);

    expect(screen.getByRole('dialog', { name: 'Escolha a promoção' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'dama' }));

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Escolha a promoção' })).toBeNull();
    expect(document.activeElement).toBe(pawn);
  });

  it('formats clocks without displaying negative time', () => {
    expect(formatClock(61000)).toBe('1:01');
    expect(formatClock(-10)).toBe('0:00');
  });

  it('shows an infinity glyph for the untimed control', () => {
    expect(formatClock(1_728_000_000)).toBe('∞');
  });

  it('makes SAN notation explicit for beginners, in Brazilian notation', () => {
    expect(formatMove({ san: 'Nh3', from: 'f2', to: 'h3' } as GameMove)).toBe('Ch3 · cavalo f2→h3');
  });

  it('derives the moved piece from the authoritative FEN instead of guessing from SAN', () => {
    const queenMove = {
      fenBefore: '4k3/8/8/8/8/8/8/3QK3 w - - 0 1',
      from: 'd1',
      san: 'Dh5',
      to: 'h5',
    } as GameMove;

    expect(formatMove(queenMove)).toBe('Dh5 · dama d1→h5');
  });

  it('enables coaching only on the selected player turn', () => {
    const base = {
      assistedColor: null,
      coachMode: true,
      connection: 'online' as const,
      isDemo: false,
      myColor: 'white' as const,
      sideToMove: 'white' as const,
      status: 'active' as const,
    };

    expect(shouldCoachTurn(base)).toBe(true);
    expect(shouldCoachTurn({ ...base, sideToMove: 'black' })).toBe(false);
    expect(
      shouldCoachTurn({
        ...base,
        assistedColor: 'black',
        connection: 'demo',
        isDemo: true,
        sideToMove: 'white',
      }),
    ).toBe(false);
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
