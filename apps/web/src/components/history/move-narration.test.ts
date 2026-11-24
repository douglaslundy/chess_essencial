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
  explainMove,
  narrationTextForPlayer,
  reviewMoveComment,
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

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('explainMove', () => {
  const nf3 = { fenBefore: START, san: 'Nf3', uci: 'g1f3' };

  it('shows the notation in the text and spells the move out in the speech', () => {
    const text = explainMove(nf3, move({ quality: 'bom', san: 'Nf3' }), 'text');
    const speech = explainMove(nf3, move({ quality: 'bom', san: 'Nf3' }), 'speech');
    expect(text).toContain('Você jogou Cf3, um lance bom.');
    expect(speech).toContain('Você jogou o cavalo de g1 para f3, um lance bom.');
  });

  it('says what the move does on the board, not only its name', () => {
    expect(explainMove(nf3, move({ quality: 'bom', san: 'Nf3' }), 'text')).toContain(
      'Desenvolve a peça',
    );
  });

  it('explains what a weak move gives away and suggests the better move with its purpose', () => {
    // Rook leaves the defence of the c4 bishop; Rc1-c2 would keep it protected.
    const fen = '2r1k3/8/8/8/2B5/8/8/2R1K3 w - - 0 1';
    const sentence = explainMove(
      { fenBefore: fen, san: 'Ra1', uci: 'c1a1' },
      move({ bestMoveUci: 'c4f7', centipawnLoss: 320, quality: 'gafe', san: 'Ra1' }),
      'text',
    );
    expect(sentence).toContain('Ponto fraco: deixa o bispo em c4 vulnerável a captura.');
    expect(sentence).toContain('No seu lugar, eu jogaria Bf7');
    expect(sentence).toContain('infelizmente isso foi uma gafe');
    expect(sentence).not.toContain('saldo de material');
  });

  it('does not praise a weak move: a check that loses a pawn only says what it loses', () => {
    // Qa4+ checks, but the d5 pawn is left to the black queen.
    const fen = '3qk3/8/8/3P4/8/8/8/3QK3 w - - 0 1';
    const text = explainMove(
      { fenBefore: fen, san: 'Qa4+', uci: 'd1a4' },
      move({ bestMoveUci: 'e1f2', centipawnLoss: 150, quality: 'erro', san: 'Qa4+' }),
      'text',
      'opponent',
    );
    expect(text).not.toContain('Dá xeque');
    expect(text).toContain('Ponto fraco: deixa o peão em d5 vulnerável a captura.');
    expect(text).toContain('No lugar dele, eu jogaria Rf2.');
  });

  it('does not read out the evaluation or the missed-advantage sentence', () => {
    const text = explainMove(nf3, move({ missedWin: true, quality: 'imprecisao' }), 'text');
    expect(text).not.toContain('chance de ganhar uma vantagem maior');
    expect(text).not.toContain('Pela análise');
  });

  it('never calls the best move weak nor suggests the move already played', () => {
    const fen = 'r3kbnr/pppqpppp/2n5/3p1b2/3P1B2/2N5/PPPQPPPP/R3KBNR b KQkq - 0 1';
    const text = explainMove(
      { fenBefore: fen, san: 'O-O-O', uci: 'e8c8' },
      move({ bestMoveUci: 'e8c8', centipawnLoss: 60, quality: 'imprecisao', san: 'O-O-O' }),
      'text',
      'opponent',
    );
    expect(text).toContain('um ótimo lance');
    expect(text).toContain('Ponto forte: é o melhor lance aqui, porque faz o roque grande');
    expect(text).not.toContain('eu jogaria');
    expect(text).not.toContain('Ponto fraco');
  });

  it('says what a weak move misses instead of a bare verdict', () => {
    // Black knight on e5 is loose; Nf3 ignores it, Qxe5 would take it.
    const fen = '4k3/8/8/4n3/8/8/8/4QK2 w - - 0 1';
    const text = explainMove(
      { fenBefore: fen, san: 'Qd2', uci: 'e1d2' },
      move({ bestMoveUci: 'e1e5', centipawnLoss: 300, quality: 'erro', san: 'Qd2' }),
      'text',
    );
    expect(text).toContain('Ponto fraco: deixa passar a chance de capturar o cavalo.');
    expect(text).toContain('No seu lugar, eu jogaria Dxe5+.');
    expect(text).not.toContain('cede parte da vantagem');
  });

  it('still names the move when there is no analysis yet', () => {
    expect(explainMove(nf3, null, 'speech')).toMatch(/^Você jogou o cavalo de g1 para f3\./);
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

describe('reviewMoveComment', () => {
  const played = { color: 'white' as const, fenBefore: START, ply: 1, san: 'Nf3', uci: 'g1f3' };

  it('stays silent without a move or without a side', () => {
    expect(reviewMoveComment(null, null, [], 'white')).toBeNull();
    expect(reviewMoveComment(played, move(), [], null)).toBeNull();
  });

  it('evaluates the opponent move too, worded about the opponent', () => {
    const comment = reviewMoveComment(
      played,
      move({ bestMoveUci: 'e2e4', centipawnLoss: 320, quality: 'gafe' }),
      [],
      'black',
    )!;
    expect(comment.text).toMatch(/^O adversário jogou Cf3, e infelizmente isso foi uma gafe\./);
    expect(comment.text).toContain('No lugar dele, eu jogaria');
    expect(comment.text).not.toContain('Você');
    expect(comment.text).toContain('Ponto fraco');
  });

  it('prefers the AI key-moment narrative for this ply', () => {
    const moment = {
      color: 'white' as const,
      narrative: 'Bom desenvolvimento.',
      ply: 1,
      quality: 'bom' as const,
      san: 'Nf3',
    };
    expect(reviewMoveComment(played, move(), [moment], 'white')?.text).toBe('Bom desenvolvimento.');
  });

  it('gives a board-based comment for every move, with separate text and speech', () => {
    const comment = reviewMoveComment(played, move({ quality: 'bom', san: 'Nf3' }), [], 'white')!;
    expect(comment.text).toContain('Cf3');
    expect(comment.speech).toContain('o cavalo de gê 1 para éfe 3');
    expect(reviewMoveComment(played, null, [], 'white')?.speech).toMatch(/^Você jogou o cavalo/);
  });
});
