import type { GameMoveAnalysis, MoveQuality } from '@xadrez/contracts';

import { speakableSquares, toBrazilianSan } from '@/lib/notation';

export const moveQualityLabel: Record<MoveQuality, string> = {
  bom: 'Bom',
  erro: 'Erro',
  excelente: 'Excelente',
  gafe: 'Gafe',
  imprecisao: 'Imprecisão',
  otimo: 'Ótimo',
};

function speakableSquarePair(uci: string): string {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  return `${from} para ${to}`;
}

/** Short label shown in the move's speech-bubble panel, e.g. "Bom · -35cp". */
export function describeMoveQuality(move: GameMoveAnalysis): string {
  const label = moveQualityLabel[move.quality];
  if (move.centipawnLoss <= 0) return label;
  return `${label} · -${move.centipawnLoss}cp`;
}

/** Full sentence read aloud by the voice narration toggle. */
export function narrateMove(move: GameMoveAnalysis): string {
  const label = moveQualityLabel[move.quality];
  let sentence = `${toBrazilianSan(move.san)}: ${label}.`;
  if (move.quality !== 'otimo' && move.quality !== 'excelente' && move.bestMoveUci) {
    sentence += ` Eu sugiro ${speakableSquarePair(move.bestMoveUci)}.`;
  }
  if (move.missedWin) sentence += ' Havia uma oportunidade melhor nessa posição.';
  return speakableSquares(sentence);
}
