import { ChessJsRules, describeMoveFacts, moveFacts } from '@xadrez/chess-domain';
import type { LiveNarrationRequest, MoveQuality } from '@xadrez/contracts';

export type AuthoritativeLiveNarrationRequest = LiveNarrationRequest & { fen: string };

export const LIVE_NARRATION_SYSTEM_PROMPT = `Você é o Treinador, um instrutor de xadrez brasileiro falando em primeira pessoa ("eu") diretamente com o aluno, ao vivo. O servidor acrescenta antes do seu texto qual lance eu indico e, depois, uma sequência curta; tudo vira voz, então seja breve.

Regras obrigatórias:
- Português do Brasil, uma ou duas frases curtas, no máximo 30 palavras no total.
- Pense como um jogador de xadrez. Diga a ideia principal: o que o lance ataca, defende ou deixa vulnerável e qual é o plano a seguir. Sem rótulos como "Objetivo:" ou "Tema:".
- Escreva como um treinador falando ao lado do aluno: frases completas, ligadas por conectivos como "porque", "assim" e "então". Nada telegráfico nem com cara de relatório.
- Fale sempre em primeira pessoa: "eu indico", "eu calculo", "eu vejo". Nunca diga motor, engine, Stockfish, computador nem programa.
- Não mencione nenhuma peça, casa ou lance; o servidor acrescentará esses dados de forma autoritativa.
- Fale de armadilha ou tática só quando os dados a confirmarem.
- Nunca invente avaliações fora dos dados fornecidos.
- Sem listas, marcadores, emojis, markdown, aspas ou introdução.`;

const qualityLabelPt: Record<MoveQuality, string> = {
  bom: 'bom',
  erro: 'erro',
  excelente: 'excelente',
  gafe: 'gafe',
  imprecisao: 'imprecisão',
  otimo: 'ótimo',
};

const spokenQuality: Record<MoveQuality, string> = {
  bom: 'bom',
  erro: 'um erro',
  excelente: 'excelente',
  gafe: 'uma gafe',
  imprecisao: 'uma imprecisão',
  otimo: 'ótimo',
};

const pieceLabel = {
  B: 'bispo',
  K: 'rei',
  N: 'cavalo',
  Q: 'dama',
  R: 'torre',
} as const;

const pieceLetterPt: Record<string, string> = { B: 'B', K: 'R', N: 'C', Q: 'D', R: 'T' };
const FORBIDDEN_CHESS_REFERENCE = /\b(?:rei|dama|rainha|torre|bispo|cavalo|pe[aã]o|[a-h][1-8])\b/i;
// The Treinador speaks for itself ("eu indico"): a reply naming the engine is discarded.
const FORBIDDEN_ENGINE_REFERENCE = /\b(?:motor|engine|stockfish|computador|programa)\b/i;
const MAX_REASON_WORDS = 45;
/** Moves of the calculated line read after the suggestion (the suggestion included). */
const SPOKEN_LINE_MOVES = 3;

function brazilianSan(san: string): string {
  return san
    .replace(/^[KQRBN]/, (letter) => pieceLetterPt[letter]!)
    .replace(/=([KQRBN])/, (_match, letter: string) => `=${pieceLetterPt[letter]}`);
}

function formatEval(mate: number | null, scoreCp: number | null): string {
  if (mate !== null) return `mate em ${Math.abs(mate)}`;
  if (scoreCp !== null) return `avaliação de ${(scoreCp / 100).toFixed(1)}`;
  return 'sem avaliação numérica';
}

export function authoritativeMoveDescription(fen: string, uci: string): string {
  const move = new ChessJsRules(fen).applyMove(uci);
  const initial = move.san.charAt(0) as keyof typeof pieceLabel;
  const piece = pieceLabel[initial] ?? 'peão';
  return `${piece} de ${move.from} para ${move.to}`;
}

function authoritativeVariationDescription(fen: string, variation: string[]): string | null {
  const rules = new ChessJsRules(fen);
  const moves: string[] = [];
  for (const uci of variation.slice(0, SPOKEN_LINE_MOVES)) {
    try {
      moves.push(brazilianSan(rules.applyMove(uci).san));
    } catch {
      break;
    }
  }
  return moves.length > 1 ? moves.join(', ') : null;
}

function fallbackReason(input: AuthoritativeLiveNarrationRequest): string {
  if (input.kind === 'suggestion') {
    return input.mate !== null
      ? 'Eu vejo um ataque forçado que leva ao mate; mantenho a iniciativa.'
      : 'Eu melhoro a coordenação das peças sem assumir riscos.';
  }
  return input.missedWin
    ? 'Esse lance deixa escapar uma vantagem maior; eu procuraria lances mais forçantes.'
    : 'Esse lance perde parte da vantagem; eu compararia alternativas mais seguras.';
}

export function composeAuthoritativeNarrative(
  input: AuthoritativeLiveNarrationRequest,
  generatedReason: string,
): string {
  const move = authoritativeMoveDescription(
    input.fen,
    input.kind === 'suggestion' ? input.bestMoveUci : input.uci,
  );
  const normalized = generatedReason.replace(/\s+/g, ' ').trim();
  const reason =
    normalized &&
    !FORBIDDEN_CHESS_REFERENCE.test(normalized) &&
    !FORBIDDEN_ENGINE_REFERENCE.test(normalized) &&
    normalized.split(' ').length <= MAX_REASON_WORDS
      ? normalized
      : fallbackReason(input);
  const article = /^(?:dama|torre)/.test(move) ? 'a' : 'o';
  if (input.kind === 'suggestion') {
    const variation = authoritativeVariationDescription(input.fen, input.principalVariation);
    const forecast = variation ? ` A linha que eu imagino é ${variation}.` : '';
    return `Eu indico levar ${article} ${move}. ${reason}${forecast}`;
  }
  return `Cuidado: você ia levar ${article} ${move}, e eu considero esse lance ${spokenQuality[input.quality]}. ${reason}`;
}

/** Board facts about the move being explained, so the reason is about the position, not generic. */
function boardFactsLine(fen: string, uci: string | null): string {
  const facts = uci ? moveFacts(fen, uci) : null;
  const lines = facts ? describeMoveFacts(facts) : [];
  return lines.length > 0
    ? `Fatos do tabuleiro sobre esse lance (para você entender, sem citar peças ou casas): ${lines.join(' ')}`
    : '';
}

export function buildLiveNarrationPrompt(input: AuthoritativeLiveNarrationRequest): string {
  if (input.kind === 'suggestion') {
    return [
      'O servidor já descreverá de modo autoritativo qual peça vai para qual casa e a linha possível.',
      `Posição FEN para análise interna: ${input.fen}`,
      boardFactsLine(input.fen, input.bestMoveUci),
      `Minha análise encontrou ${formatEval(input.mate, input.scoreCp)} para a sugestão.`,
      `Variação calculada, limitada a três respostas do adversário: ${input.principalVariation.join(' ') || 'indisponível'}.`,
      'Explique em uma ou duas frases curtas a ideia do lance, sem citar peças, casas ou lances.',
    ].join('\n');
  }
  return [
    'O servidor já descreverá de modo autoritativo qual peça vai para qual casa.',
    `Posição FEN para análise interna: ${input.fen}`,
    boardFactsLine(input.fen, input.uci),
    `Minha análise classificou a tentativa como ${qualityLabelPt[input.quality]}, com perda de ${input.centipawnLoss} centipawns.`,
    input.missedWin ? 'A tentativa também deixa escapar uma vantagem maior.' : '',
    'Explique em uma ou duas frases curtas a ideia do lance, sem citar peças, casas ou lances.',
  ]
    .filter(Boolean)
    .join('\n');
}
