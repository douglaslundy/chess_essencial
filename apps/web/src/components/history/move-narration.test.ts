import type { GameMoveAnalysis } from '@xadrez/contracts';
import { describe, expect, it } from 'vitest';

import { describeMoveQuality, narrateMove } from './move-narration';

function move(overrides: Partial<GameMoveAnalysis> = {}): GameMoveAnalysis {
  return {
    bestMoveUci: null,
    centipawnLoss: 0,
    color: 'white',
    mateAfter: null,
    mateBefore: null,
    missedWin: false,
    ply: 1,
    quality: 'otimo',
    san: 'e4',
    scoreAfterCp: 20,
    scoreBeforeCp: 20,
    uci: 'e2e4',
    ...overrides,
  };
}

describe('describeMoveQuality', () => {
  it('omits the centipawn loss for a lossless move', () => {
    expect(describeMoveQuality(move({ centipawnLoss: 0, quality: 'otimo' }))).toBe('Ótimo');
  });

  it('includes the centipawn loss otherwise', () => {
    expect(describeMoveQuality(move({ centipawnLoss: 220, quality: 'erro' }))).toBe(
      'Erro · -220cp',
    );
  });
});

describe('narrateMove', () => {
  it('reads the move (translated to Brazilian notation) and its quality', () => {
    expect(narrateMove(move({ quality: 'bom', san: 'Nf3' }))).toBe('Cf3: Bom.');
  });

  it('suggests, in first person, an alternative for a weak move', () => {
    const sentence = narrateMove(move({ bestMoveUci: 'd2d4', quality: 'erro', san: 'a3' }));
    expect(sentence).toBe('a3: Erro. Eu sugiro d2 para d4.');
  });

  it('does not suggest an alternative for otimo/excelente moves even if bestMoveUci is set', () => {
    expect(narrateMove(move({ bestMoveUci: 'd2d4', quality: 'excelente' }))).toBe('e4: Excelente.');
  });

  it('translates the queen to "D" (Dama), not the English "Q"', () => {
    expect(narrateMove(move({ quality: 'otimo', san: 'Qxe4+' }))).toBe('Dxe4+: Ótimo.');
  });

  it('mentions a missed winning opportunity', () => {
    expect(narrateMove(move({ missedWin: true, quality: 'gafe' }))).toContain(
      'Havia uma oportunidade melhor',
    );
  });
});
