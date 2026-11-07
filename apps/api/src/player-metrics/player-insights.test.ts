import { describe, expect, it } from 'vitest';

import { buildInsights, type InsightInput } from './player-insights.js';

const base: InsightInput = {
  analyzedGames: 10,
  badByPhase: { endgame: 0, middlegame: 0, opening: 0 },
  draws: 1,
  gamesPlayed: 10,
  losses: 3,
  lossesOnTime: 0,
  quality: { bom: 80, erro: 2, excelente: 40, gafe: 0, imprecisao: 10, missedWin: 1, otimo: 60 },
  wins: 6,
};

describe('buildInsights', () => {
  it('asks for a first game when there is none', () => {
    const result = buildInsights({ ...base, gamesPlayed: 0 });
    expect(result.strengths).toEqual([]);
    expect(result.summary).toContain('ainda não terminou');
  });

  it('praises accuracy, win rate and a clean record', () => {
    const { strengths, weaknesses } = buildInsights(base);
    expect(strengths.join(' ')).toContain('Precisão');
    expect(strengths.join(' ')).toContain('60%');
    expect(strengths.join(' ')).toContain('Nenhuma gafe');
    expect(weaknesses).toEqual([]);
  });

  it('flags blunders, missed wins, the weak phase and time losses', () => {
    const { weaknesses, summary } = buildInsights({
      ...base,
      badByPhase: { endgame: 8, middlegame: 2, opening: 1 },
      losses: 5,
      lossesOnTime: 3,
      quality: { ...base.quality, gafe: 9, missedWin: 4 },
    });
    const text = weaknesses.join(' ');
    expect(text).toContain('Gafes: 9');
    expect(text).toContain('Oportunidades perdidas: 4');
    expect(text).toContain('no final de partida');
    expect(text).toContain('Tempo: 3 das suas 5 derrotas');
    expect(summary).toContain('foque primeiro em: gafes');
  });
});
