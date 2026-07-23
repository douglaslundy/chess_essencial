// @vitest-environment jsdom
import type { GameMove } from '@xadrez/contracts';
import { describe, expect, it } from 'vitest';

import { demoBranchPoint, gameOutcomeFor, historyBaseIndex, stepHistoryIndex } from './game-room';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function move(ply: number, fenAfter: string): GameMove {
  return {
    clientMoveId: `move-${ply}`,
    color: ply % 2 === 1 ? 'white' : 'black',
    committedAt: new Date().toISOString(),
    fenAfter,
    fenBefore: fenAfter,
    flags: { capture: false, castling: null, enPassant: false, promotion: false },
    from: 'e2',
    id: ply,
    ply,
    promotion: null,
    san: 'e4',
    to: 'e4',
    uci: 'e2e4',
  };
}

describe('gameOutcomeFor', () => {
  it('is a win when the result matches the player color', () => {
    expect(gameOutcomeFor('white_win', 'white')).toBe('win');
    expect(gameOutcomeFor('black_win', 'black')).toBe('win');
  });

  it('is a loss when the result belongs to the opponent', () => {
    expect(gameOutcomeFor('black_win', 'white')).toBe('loss');
    expect(gameOutcomeFor('white_win', 'black')).toBe('loss');
  });

  it('is a draw regardless of color', () => {
    expect(gameOutcomeFor('draw', 'white')).toBe('draw');
    expect(gameOutcomeFor('draw', 'black')).toBe('draw');
  });
});

describe('history navigation helpers', () => {
  const moves = [move(1, 'fen-1'), move(2, 'fen-2'), move(3, 'fen-3')];

  it('treats "live" (null) as the last move for stepping purposes', () => {
    expect(historyBaseIndex(null, moves)).toBe(2);
  });

  it('steps back one move at a time, clamped at the first move', () => {
    expect(stepHistoryIndex(null, -1, moves)).toBe(1);
    expect(stepHistoryIndex(1, -1, moves)).toBe(0);
    expect(stepHistoryIndex(0, -1, moves)).toBe(0);
  });

  it('steps forward one move at a time, clamped at the last move', () => {
    expect(stepHistoryIndex(0, 1, moves)).toBe(1);
    expect(stepHistoryIndex(2, 1, moves)).toBe(2);
  });

  it('does nothing meaningful with zero moves', () => {
    expect(stepHistoryIndex(null, -1, [])).toBeNull();
  });
});

describe('demoBranchPoint', () => {
  const moves = [move(1, 'fen-1'), move(2, 'fen-2'), move(3, 'fen-3')];

  it('appends at the tip when not viewing history', () => {
    const point = demoBranchPoint(moves, null, START);
    expect(point.branchAt).toBe(3);
    expect(point.baseMoves).toHaveLength(3);
    expect(point.baseFen).toBe('fen-3');
  });

  it('branches from the viewed position, dropping later moves', () => {
    const point = demoBranchPoint(moves, 0, START);
    expect(point.branchAt).toBe(1);
    expect(point.baseMoves).toHaveLength(1);
    expect(point.baseFen).toBe('fen-1');
  });

  it('branches from the start when rewound before the first move', () => {
    const point = demoBranchPoint([], null, START);
    expect(point.branchAt).toBe(0);
    expect(point.baseMoves).toHaveLength(0);
    expect(point.baseFen).toBe(START);
  });
});
