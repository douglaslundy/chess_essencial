import { describe, expect, it } from 'vitest';

import { buildMomentPrompt, NARRATION_SYSTEM_PROMPT } from './prompts.js';

describe('buildMomentPrompt', () => {
  it('gives the model the position and what the move really does, plus the better move', () => {
    const prompt = buildMomentPrompt({
      bestMoveUci: 'c4f7',
      centipawnLoss: 320,
      color: 'white',
      fenBefore: '2r1k3/8/8/8/2B5/8/8/2R1K3 w - - 0 1',
      missedWin: false,
      ply: 7,
      quality: 'gafe',
      san: 'Ra1',
      uci: 'c1a1',
    });
    expect(prompt).toContain('2r1k3/8/8/8/2B5/8/8/2R1K3 w - - 0 1');
    expect(prompt).toContain('torre de c1 para a1');
    expect(prompt).toContain('Deixa o bispo em c4 vulnerável a captura.');
    expect(prompt).toContain('Melhor lance: bispo de c4 para f7');
  });

  it('does not offer a better move for a brilliant one', () => {
    const prompt = buildMomentPrompt({
      bestMoveUci: 'g1f3',
      centipawnLoss: 0,
      color: 'white',
      fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      missedWin: false,
      ply: 1,
      quality: 'otimo',
      san: 'Nf3',
      uci: 'g1f3',
    });
    expect(prompt).not.toContain('Melhor lance:');
  });

  it('tells the model to think like a chess player and never name the engine', () => {
    expect(NARRATION_SYSTEM_PROMPT).toContain('Pense como um jogador de xadrez');
    expect(NARRATION_SYSTEM_PROMPT).toContain('Nunca diga motor');
  });
});
