import { ChessJsRules } from '@xadrez/chess-domain';
import type { LiveNarrationRequest, MoveQuality } from '@xadrez/contracts';

export type AuthoritativeLiveNarrationRequest = LiveNarrationRequest & { fen: string };

export const LIVE_NARRATION_SYSTEM_PROMPT = `Você é o Treinador, um instrutor de xadrez brasileiro falando em primeira pessoa ("eu") diretamente com o aluno, ao vivo. O texto será unido a uma descrição de lance criada pelo servidor e convertido em voz.

Regras obrigatórias:
- Português do Brasil, no máximo uma frase curta e 18 palavras.
- Explique somente a ideia estratégica ou tática.
- Não mencione nenhuma peça, casa ou lance; o servidor acrescentará esses dados de forma autoritativa.
- Nunca invente avaliações fora dos dados fornecidos.
- Sem listas, marcadores, emojis, markdown, aspas ou introdução; responda somente com o motivo.`;

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

const FORBIDDEN_CHESS_REFERENCE = /\b(?:rei|dama|rainha|torre|bispo|cavalo|pe[aã]o|[a-h][1-8])\b/i;

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

function fallbackReason(input: AuthoritativeLiveNarrationRequest): string {
  if (input.kind === 'suggestion') {
    if (input.mate !== null) return 'Esse lance manté um ataque decisivo.';
    return 'Esse lance preserva a melhor avaliação encontrada pelo motor.';
  }
  if (input.missedWin) return 'Esse lance deixa escapar uma vantagem importante.';
  return 'Esse lance cede mais vantagem do que a melhor alternativa.';
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
    normalized && !FORBIDDEN_CHESS_REFERENCE.test(normalized) ? normalized : fallbackReason(input);
  if (input.kind === 'suggestion') return `Eu sugiro mover ${move}. ${reason}`;
  return `Você está prestes a mover ${move}. Eu classifico esse lance como ${qualityLabelPt[input.quality]}, com perda de ${input.centipawnLoss} centipawns. ${reason}`;
}

export function buildLiveNarrationPrompt(input: AuthoritativeLiveNarrationRequest): string {
  if (input.kind === 'suggestion') {
    return [
      'O servidor já descreverá de modo autoritativo qual peça vai para qual casa.',
      `O motor encontrou ${formatEval(input.mate, input.scoreCp)} para a sugestão.`,
      'Forneça apenas o motivo curto da sugestão, sem citar peças, casas ou lances.',
    ].join('\n');
  }
  return [
    'O servidor já descreverá de modo autoritativo qual peça vai para qual casa.',
    `O motor classificou a tentativa como ${qualityLabelPt[input.quality]}, com perda de ${input.centipawnLoss} centipawns.`,
    input.missedWin ? 'A tentativa também deixa escapar uma vantagem maior.' : '',
    'Forneça apenas o motivo curto do alerta, sem citar peças, casas ou lances.',
  ]
    .filter(Boolean)
    .join('\n');
}
