// @vitest-environment jsdom
import type { GameMove } from '@xadrez/contracts';
import { describe, expect, it } from 'vitest';

import { historyBaseIndex, stepHistoryIndex } from './game-room';

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
