import { ChessJsRules } from '@xadrez/chess-domain';
import type { LiveNarrationRequest, MoveQuality } from '@xadrez/contracts';

export type AuthoritativeLiveNarrationRequest = LiveNarrationRequest & { fen: string };

export const LIVE_NARRATION_SYSTEM_PROMPT = `Você é o Treinador, um instrutor de xadrez brasileiro falando em primeira pessoa ("eu") diretamente com o aluno, ao vivo. O texto será unido a uma descrição de lance e a uma linha calculada pelo motor, ambas criadas pelo servidor, e convertido em voz.

Regras obrigatórias:
- Português do Brasil, no máximo quatro frases curtas e 80 palavras.
- Responda no formato: "Objetivo: ... Tema: ... Estratégia: ... Armadilha: ...".
- Explique a finalidade do lance, o tema tático, o plano estratégico e a armadilha; quando não houver evidência, diga que não foi confirmada.
- Não mencione nenhuma peça, casa ou lance; o servidor acrescentará esses dados de forma autoritativa.
- Trate a variação do motor como linha possível, nunca como certeza sobre o adversário.
- Nunca invente avaliações fora dos dados fornecidos.
- Sem listas, marcadores, emojis, markdown, aspas ou introdução; responda somente com os quatro campos.`;

const qualityLabelPt: Record<MoveQuality, string> = {
  bom: 'bom',
  erro: 'erro',
  excelente: 'excelente',
  gafe: 'gafe',
  imprecisao: 'imprecisão',
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
const REQUIRED_PLAN_FIELDS = [/Objetivo:/i, /Tema:/i, /Estratégia:/i, /Armadilha:/i];

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
  for (const uci of variation.slice(0, 7)) {
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
    if (input.mate !== null) {
      return 'Objetivo: manter o ataque decisivo. Tema: sequência de mate. Estratégia: conservar a iniciativa. Armadilha: ameaça forçada confirmada pelo motor.';
    }
    return 'Objetivo: preservar a melhor avaliação. Tema: nenhum tema tático foi confirmado. Estratégia: melhorar a coordenação. Armadilha: nenhuma armadilha forçada foi confirmada.';
  }
  if (input.missedWin) {
    return 'Objetivo: evitar perder a vantagem. Tema: oportunidade tática desperdiçada. Estratégia: reavaliar lances forçantes. Armadilha: nenhuma armadilha adicional foi confirmada.';
  }
  return 'Objetivo: reduzir a perda de avaliação. Tema: erro tático ou posicional. Estratégia: comparar alternativas seguras. Armadilha: nenhuma armadilha forçada foi confirmada.';
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
  const hasRequiredPlan =
    input.kind !== 'suggestion' || REQUIRED_PLAN_FIELDS.every((field) => field.test(normalized));
  const reason =
    normalized && !FORBIDDEN_CHESS_REFERENCE.test(normalized) && hasRequiredPlan
      ? normalized
      : fallbackReason(input);
  if (input.kind === 'suggestion') {
    const variation = authoritativeVariationDescription(input.fen, input.principalVariation);
    const forecast = variation ? ` Linha possível calculada: ${variation}.` : '';
    return `Eu sugiro mover ${move}. ${reason}${forecast}`;
  }
  return `Você está prestes a mover ${move}. Eu classifico esse lance como ${qualityLabelPt[input.quality]}, com perda de ${input.centipawnLoss} centipawns. ${reason}`;
}

export function buildLiveNarrationPrompt(input: AuthoritativeLiveNarrationRequest): string {
  if (input.kind === 'suggestion') {
    return [
      'O servidor já descreverá de modo autoritativo qual peça vai para qual casa e a linha possível.',
      `Posição FEN para análise interna: ${input.fen}`,
      `O motor encontrou ${formatEval(input.mate, input.scoreCp)} para a sugestão.`,
      `Variação calculada, limitada a três respostas do adversário: ${input.principalVariation.join(' ') || 'indisponível'}.`,
      'Explique objetivo, tema, estratégia e armadilha sem citar peças, casas ou lances.',
    ].join('\n');
  }
  return [
    'O servidor já descreverá de modo autoritativo qual peça vai para qual casa.',
    `Posição FEN para análise interna: ${input.fen}`,
    `O motor classificou a tentativa como ${qualityLabelPt[input.quality]}, com perda de ${input.centipawnLoss} centipawns.`,
    input.missedWin ? 'A tentativa também deixa escapar uma vantagem maior.' : '',
    'Explique objetivo, tema, estratégia e armadilha sem citar peças, casas ou lances.',
  ]
    .filter(Boolean)
    .join('\n');
}
