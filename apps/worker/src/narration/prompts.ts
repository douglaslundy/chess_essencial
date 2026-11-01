import type { MoveQuality } from '@xadrez/contracts';

// Adapted from the product's "instrutor de xadrez com voz humanizada" brief,
// scoped to the post-game review narration only (no live pre/post-move
// coaching yet). The model never calculates chess — every fact it's given
// (move, quality, centipawn loss, best move) already comes from the
// Stockfish-backed analysis pipeline; its only job is turning that into
// natural, varied, spoken Portuguese.
export const NARRATION_SYSTEM_PROMPT = `Você é um instrutor de xadrez brasileiro, caloroso e direto, escrevendo a narração falada da revisão pós-partida de um aluno. O texto que você escreve é convertido em voz (TTS): escreva como quem fala, não como quem escreve um relatório.

Regras obrigatórias:
- Português do Brasil, tom de conversa, como um treinador falando com o aluno.
- Nomeie peças e casas em linguagem falada ("cavalo para f3", "torre para a coluna d"), nunca notação crua isolada como "Nf3" sem contexto.
- Toda explicação precisa dizer O QUE aconteceu e POR QUE, com motivo concreto (material perdido, ameaça criada, avaliação que mudou) — nunca "porque é o melhor lance" sem explicar o motivo real.
- Frases curtas, entre 8 e 20 palavras. Sem listas, marcadores, emojis, markdown ou notação entre parênteses.
- Não repita a mesma fórmula de abertura de frase em textos consecutivos.
- Nunca invente lances, variantes ou avaliações que não estejam nos dados fornecidos — você só recebe fatos já calculados por um motor de xadrez real.
- Não humilhe em erro nem exagere elogio em lance banal.
- Fale em primeira pessoa ("eu indico", "eu vejo"). Nunca diga motor, engine, Stockfish, computador nem programa.
- Seja resumido: diga só o essencial de cada momento.`;

const qualityLabelPt: Record<MoveQuality, string> = {
  bom: 'bom',
  erro: 'erro',
  excelente: 'excelente',
  gafe: 'gafe (perda grave)',
  imprecisao: 'imprecisão',
  otimo: 'ótimo',
};

export interface MomentFacts {
  bestMoveUci: string | null;
  centipawnLoss: number;
  color: 'white' | 'black';
  missedWin: boolean;
  ply: number;
  quality: MoveQuality;
  san: string;
  uci: string;
}

export function buildMomentPrompt(moment: MomentFacts): string {
  const lines = [
    `Lance ${moment.ply} (${moment.color === 'white' ? 'brancas' : 'pretas'}): jogado ${moment.san} (${moment.uci}).`,
    `Classificação do motor: ${qualityLabelPt[moment.quality]}.`,
    `Perda de centipawns em relação ao melhor lance: ${moment.centipawnLoss}.`,
    moment.bestMoveUci
      ? `Melhor lance segundo o motor: ${moment.bestMoveUci}.`
      : 'O motor não indicou um lance alternativo (posição terminal ou sem perda).',
    moment.missedWin
      ? 'Havia uma oportunidade de vantagem maior nessa posição que não foi aproveitada.'
      : '',
    '',
    'Escreva uma explicação falada, de 2 a 4 frases, sobre este lance especificamente, seguindo todas as regras acima. Responda apenas com o texto da fala, sem aspas e sem introdução.',
  ];
  return lines.filter(Boolean).join('\n');
}

export interface GameSummaryFacts {
  color: 'white' | 'black';
  finalMoment: MomentFacts & { narrative: string };
  qualityCounts: Record<MoveQuality | 'missedWin', number>;
}

export interface NarratedMoment extends MomentFacts {
  narrative: string;
}

export function buildGameSummaryPrompt(
  result: string,
  termination: string,
  timeControl: string,
  totalPlies: number,
  qualityCounts: {
    white: Record<MoveQuality | 'missedWin', number>;
    black: Record<MoveQuality | 'missedWin', number>;
  },
  narratedMoments: NarratedMoment[],
): string {
  const countsLine = (
    color: 'white' | 'black',
    counts: Record<MoveQuality | 'missedWin', number>,
  ) =>
    `${color === 'white' ? 'Brancas' : 'Pretas'}: ótimo ${counts.otimo}, excelente ${counts.excelente}, bom ${counts.bom}, imprecisão ${counts.imprecisao}, erro ${counts.erro}, gafe ${counts.gafe}, oportunidades perdidas ${counts.missedWin}.`;

  const momentsText = narratedMoments
    .map(
      (moment, index) => `${index + 1}. Lance ${moment.ply} (${moment.san}): ${moment.narrative}`,
    )
    .join('\n');

  return [
    `Resultado da partida: ${result}, por ${termination}. Controle de tempo: ${timeControl}. Total de lances: ${totalPlies}.`,
    countsLine('white', qualityCounts.white),
    countsLine('black', qualityCounts.black),
    '',
    'Momentos-chave já narrados nesta partida:',
    momentsText ||
      '(nenhum momento de destaque foi identificado — partida sem erros ou gafes relevantes)',
    '',
    'Com base apenas nisso, escreva um JSON (e nada mais, sem markdown ao redor) no formato exato:',
    '{"resumo": "3 a 5 frases faladas resumindo como foi a partida, do início ao fim", "padroes": ["1 a 3 frases curtas sobre padrões que aparecem nos dados acima, cada uma como um item de lista"], "planoDeEstudo": ["2 a 3 sugestões curtas de tema para estudar, cada uma como um item de lista"]}',
    'Se os dados não sustentarem um padrão real, retorne "padroes": []. Nunca invente um padrão que os números acima não confirmem.',
  ].join('\n');
}
