import type {
  GameAnalysis,
  GameAnalysisQualityCounts,
  GameMoveAnalysis,
  GameNarration,
} from '@xadrez/contracts';
import { describe, expect, it } from 'vitest';

import {
  buildFallbackNarration,
  describeMoveQuality,
  narrateMove,
  narrationTextForPlayer,
  shouldNarrateReviewMove,
} from './move-narration';

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
    expect(narrateMove(move({ quality: 'bom', san: 'Nf3' }))).toBe('C éfe 3: Bom.');
  });

  it('suggests, in first person, an alternative for a weak move, spelling out square letters', () => {
    const sentence = narrateMove(move({ bestMoveUci: 'd2d4', quality: 'erro', san: 'a3' }));
    expect(sentence).toBe('á 3: Erro. Eu sugiro dê 2 para dê 4.');
  });

  it('does not suggest an alternative for otimo/excelente moves even if bestMoveUci is set', () => {
    expect(narrateMove(move({ bestMoveUci: 'd2d4', quality: 'excelente' }))).toBe(
      'é 4: Excelente.',
    );
  });

  it('translates the queen to "D" (Dama), not the English "Q"', () => {
    expect(narrateMove(move({ quality: 'otimo', san: 'Qxe4+' }))).toBe('Dx é 4+: Ótimo.');
  });

  it('mentions a missed winning opportunity', () => {
    expect(narrateMove(move({ missedWin: true, quality: 'gafe' }))).toContain(
      'Havia uma oportunidade melhor',
    );
  });
});

function qualityCounts(
  overrides: Partial<GameAnalysisQualityCounts> = {},
): GameAnalysisQualityCounts {
  return {
    bom: 0,
    erro: 0,
    excelente: 0,
    gafe: 0,
    imprecisao: 0,
    missedWin: 0,
    otimo: 0,
    ...overrides,
  };
}

function analysis(overrides: Partial<GameAnalysis> = {}): GameAnalysis {
  return {
    errorSignals: [],
    moves: [move({ centipawnLoss: 0, ply: 1, quality: 'otimo' })],
    status: 'completed',
    summary: { black: qualityCounts(), white: qualityCounts({ otimo: 1 }) },
    ...overrides,
  };
}

describe('buildFallbackNarration', () => {
  it('returns null when the analysis has no summary yet', () => {
    expect(buildFallbackNarration(analysis({ summary: null }), 'white')).toBeNull();
  });

  it('returns null when the player made no moves at all', () => {
    expect(
      buildFallbackNarration(
        analysis({ summary: { black: qualityCounts(), white: qualityCounts() } }),
        'white',
      ),
    ).toBeNull();
  });

  it('praises a mistake-free game', () => {
    const result = buildFallbackNarration(
      analysis({ summary: { black: qualityCounts(), white: qualityCounts({ otimo: 4 }) } }),
      'white',
    );
    expect(result?.summary).toContain('Nenhum erro grave');
    expect(result?.keyMoments).toEqual([]);
  });

  it('flags the worst move as a key moment when there were mistakes', () => {
    const blunder = move({
      bestMoveUci: 'd2d4',
      centipawnLoss: 350,
      color: 'white',
      ply: 8,
      quality: 'gafe',
      san: 'Nf3',
    });
    const result = buildFallbackNarration(
      analysis({
        moves: [move({ centipawnLoss: 0, ply: 1, quality: 'otimo' }), blunder],
        summary: { black: qualityCounts(), white: qualityCounts({ gafe: 1, otimo: 1 }) },
      }),
      'white',
    );
    expect(result?.summary).toContain('1 lance que vale a pena revisar');
    expect(result?.keyMoments).toHaveLength(1);
    expect(result?.keyMoments[0]).toMatchObject({ ply: 8, quality: 'gafe' });
  });
});

describe('player-only review narration', () => {
  it('narrates only the signed-in player moves', () => {
    expect(shouldNarrateReviewMove(move({ color: 'white' }), 'white')).toBe(true);
    expect(shouldNarrateReviewMove(move({ color: 'black' }), 'white')).toBe(false);
    expect(shouldNarrateReviewMove(move({ color: 'white' }), null)).toBe(false);
  });

  it('filters opponent key moments from the narrated summary', () => {
    const narration: GameNarration = {
      keyMoments: [
        { color: 'white', narrative: 'White tip.', ply: 1, quality: 'bom', san: 'e4' },
        { color: 'black', narrative: 'Black tip.', ply: 2, quality: 'erro', san: 'e5' },
      ],
      patterns: [],
      status: 'completed',
      studyPlan: [],
      summary: 'Summary.',
    };
    expect(narrationTextForPlayer(narration, 'white')).toBe('Summary. White tip.');
    expect(narrationTextForPlayer(narration, 'black')).toBe('Summary. Black tip.');
  });
});
