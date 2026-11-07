import {
  describeMoveFacts,
  describeBetterMove,
  moveFacts,
  PIECE_NAME_PT,
} from '@xadrez/chess-domain';
import type { MoveQuality } from '@xadrez/contracts';

// Adapted from the product's "instrutor de xadrez com voz humanizada" brief,
// scoped to the post-game review narration only (no live pre/post-move
// coaching yet). The model never calculates chess — every fact it's given
// (move, quality, centipawn loss, best move) already comes from the
// Stockfish-backed analysis pipeline; its only job is turning that into
// natural, varied, spoken Portuguese.
export const NARRATION_SYSTEM_PROMPT = `Você é um instrutor de xadrez brasileiro, mestre em explicar partidas, falando com um aluno durante a revisão. O texto que você escreve é convertido em voz (TTS): escreva como quem fala.

Pense como um jogador de xadrez, não como um narrador. Para cada lance, olhe a posição (FEN) e os fatos do tabuleiro fornecidos e responda, nesta ordem de importância:
1. O que o lance faz: ataca, defende, captura, desenvolve, ocupa o centro, abre uma coluna ou diagonal, dá xeque.
2. O que ele deixa vulnerável ou o que o adversário passa a poder fazer (peça sem proteção, ameaça, perda de material).
3. Se foi bom ou ruim e por quê, de acordo com a classificação fornecida.
4. Se o lance foi fraco, qual lance era melhor e o que ele conseguiria; se foi bom, qual é o plano ou a próxima ideia que ele prepara.

Regras obrigatórias:
- Português do Brasil, tom de conversa, como um treinador ao lado do aluno. Fale com o aluno em segunda pessoa ("você") sobre os lances dele.
- Diga o nome da peça e a casa por extenso ("o cavalo de g1 para f3", "a dama de d1 captura em e5"), sempre peça, casa de origem e casa de destino, nunca notação crua como "Nf3".
- Use apenas os fatos fornecidos e o que a posição FEN mostra de forma evidente. Nunca invente lances, variantes, ameaças ou avaliações. Na dúvida, diga menos.
- Quando o lance foi fraco, diga por que o lance melhor é melhor: o que ele faz e como se compara ao jogado (material depois das trocas e ameaças; não cite números de avaliação). Use a "Comparação medida" fornecida. Se ela mostrar que o material é parecido, diga que a diferença está na posição; nunca afirme que um lance ganha mais material do que os fatos indicam. Se o lance do aluno capturou uma peça maior, reconheça isso e explique o que torna o outro melhor (por exemplo, a peça recapturada).
- Cada explicação traz O QUE aconteceu e POR QUE, com motivo concreto do tabuleiro. Nunca "porque é o melhor lance" sem motivo.
- Frases curtas, de 8 a 20 palavras, ligadas por conectivos naturais. Sem listas, emojis, markdown ou notação entre parênteses.
- Não repita a mesma abertura de frase em textos consecutivos. Não humilhe em erro nem exagere elogio em lance banal.
- Nunca diga motor, engine, Stockfish, computador nem programa; use "eu" quando for uma opinião sua.`;

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
  fenBefore: string;
  missedWin: boolean;
  ply: number;
  quality: MoveQuality;
  san: string;
  scoreAfterCp?: number | null;
  scoreBeforeCp?: number | null;
  uci: string;
}

/** Bumped whenever the prompts change, so cached narrations from the old prompt are not reused. */
export const NARRATION_PROMPT_VERSION = 7;

/**
 * Narrations completed before this instant were written with an older prompt and are redone by
 * the worker. Set it to the deploy time whenever NARRATION_PROMPT_VERSION changes.
 */
export const NARRATION_PROMPT_EPOCH = '2026-11-07T22:00:00Z';

function movePhrase(fen: string, uci: string): string {
  const facts = moveFacts(fen, uci);
  if (!facts) return uci;
  return `${PIECE_NAME_PT[facts.piece]} de ${facts.from} para ${facts.to}`;
}

export function buildMomentPrompt(moment: MomentFacts): string {
  const played = moveFacts(moment.fenBefore, moment.uci);
  const playedLines = played ? describeMoveFacts(played) : [];
  const best = moment.bestMoveUci ? moveFacts(moment.fenBefore, moment.bestMoveUci) : null;
  const comparison = describeBetterMove(played, best);
  const lines = [
    `Posição antes do lance (FEN): ${moment.fenBefore}`,
    `Lance ${moment.ply} (${moment.color === 'white' ? 'brancas' : 'pretas'}), jogado pelo aluno: ${movePhrase(moment.fenBefore, moment.uci)} (${moment.san}).`,
    playedLines.length > 0
      ? `Fatos do tabuleiro sobre o lance jogado: ${playedLines.join(' ')}`
      : 'O lance jogado não captura, não ameaça e não deixa nada exposto de forma evidente.',
    `Classificação: ${qualityLabelPt[moment.quality]}. Perda em relação ao melhor lance: ${moment.centipawnLoss} centipawns.`,
    moment.bestMoveUci && best && moment.quality !== 'otimo' && moment.quality !== 'excelente'
      ? `Melhor lance: ${movePhrase(moment.fenBefore, moment.bestMoveUci)}. Comparação medida com o lance do aluno: ${comparison.join(' ') || 'sem diferença tática evidente; a diferença está na posição.'}`
      : '',
    '',
    'Escreva a explicação falada deste lance, de 2 a 3 frases e no máximo 55 palavras, pensando como jogador de xadrez conforme as regras acima. Se o lance for um ponto forte ou um ponto fraco do aluno, diga isso de forma explícita, começando a frase por "Ponto forte:" ou "Ponto fraco:". Responda apenas com o texto da fala, sem aspas e sem introdução.',
  ];
  return lines.filter((line) => line !== '').join('\n');
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
  exerciseThemes: readonly string[] = [],
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
    'Como um treinador de xadrez, avalie a partida pelas heurísticas clássicas e nomeie o assunto a estudar no vocabulário do jogo:',
    '- Segurança tática (blunder check): antes de cada lance, ver capturas, xeques e ameaças do adversário. Muitos erros e gafes apontam para isto.',
    '- Tática: garfos, cravadas, ataques duplos, mates. Oportunidades perdidas apontam para isto.',
    '- Abertura: desenvolver peças, controlar o centro, rocar cedo, não mover a mesma peça duas vezes, não sair com a dama cedo.',
    '- Meio-jogo: atividade das peças, segurança do rei, estrutura de peões, casas fracas, plano claro.',
    '- Finais: atividade do rei, peões passados, oposição, torre atrás do peão passado, conversão de vantagem.',
    '- Gestão de tempo: só mencione se o controle de tempo e o resultado sugerirem isso.',
    exerciseThemes.length > 0
      ? `Temas de exercício cadastrados na plataforma: ${exerciseThemes.join(', ')}. Só indique treino prático para um ponto fraco que corresponda a um destes temas; se nenhum servir, diga o assunto a estudar sem citar exercício.`
      : 'Não há temas de exercício cadastrados: não cite exercícios práticos.',
    'Use só os conceitos que os números e os momentos acima sustentam. Cada item do plano de estudo deve ser um tema concreto desta lista, dito em uma frase curta (por exemplo: "Segurança tática: confira capturas e xeques do adversário antes de jogar").',
    '',
    'Com base apenas nisso, escreva um JSON (e nada mais, sem markdown ao redor) no formato exato:',
    '{"resumo": "2 a 3 frases faladas, fluindo como conversa, resumindo como foi a partida, do início ao fim", "padroes": ["1 a 4 frases curtas sobre os pontos fortes e fracos do aluno que aparecem nos dados acima; cada item começa por "Ponto forte:" ou "Ponto fraco:""], "planoDeEstudo": ["2 a 4 temas concretos para estudar, cada um como um item de lista"]}',
    'Se os dados não sustentarem um padrão real, retorne "padroes": []. Nunca invente um padrão que os números acima não confirmem.',
  ].join('\n');
}
