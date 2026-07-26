import type {
  GameAnalysis,
  GameMoveAnalysis,
  GameNarration,
  GameNarrationKeyMoment,
  MoveQuality,
} from '@xadrez/contracts';

import { formatUciSquares, speakableSquares, toBrazilianSan } from '@/lib/notation';

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

/**
 * Free, offline stand-in for the AI-generated narration (game-narration-job
 * in the worker): built entirely from the engine analysis already fetched
 * for this review, using template sentences instead of an LLM call. Used
 * whenever no narration AI provider is configured (or its job hasn't
 * produced a result yet), so "Resumo narrado" never simply disappears —
 * read aloud with the same voice already chosen in Meus Dados.
 */
export function buildFallbackNarration(
  analysis: GameAnalysis,
  myColor: 'white' | 'black' | null,
): GameNarration | null {
  if (!analysis.summary || analysis.moves.length === 0) return null;
  const perspective = myColor ?? 'white';
  const counts = analysis.summary[perspective];
  const total =
    counts.otimo + counts.excelente + counts.bom + counts.imprecisao + counts.erro + counts.gafe;
  if (total === 0) return null;
  const mistakes = counts.erro + counts.gafe;
  const strong = counts.otimo + counts.excelente;
  const who = myColor ? 'Você' : 'O lado das brancas';

  let summary = `${who} jogou ${total} lance${total === 1 ? '' : 's'} nesta partida.`;
  summary +=
    mistakes > 0
      ? ` Foram ${mistakes} lance${mistakes === 1 ? '' : 's'} que vale a pena revisar, contra ${strong} lance${strong === 1 ? '' : 's'} muito bom${strong === 1 ? '' : 'ns'}.`
      : ' Nenhum erro grave — um bom desempenho tático.';

  const candidates = analysis.moves.filter((move) => !myColor || move.color === myColor);
  const worst = [...candidates].sort((a, b) => b.centipawnLoss - a.centipawnLoss)[0];

  const keyMoments: GameNarrationKeyMoment[] =
    worst && worst.centipawnLoss > 0
      ? [
          {
            color: worst.color,
            narrative: speakableSquares(
              `No lance ${worst.ply}, ${toBrazilianSan(worst.san)} foi classificado como ${moveQualityLabel[worst.quality].toLowerCase()}` +
                (worst.bestMoveUci
                  ? `; o lance sugerido pelo motor era ${formatUciSquares(worst.bestMoveUci)}`
                  : '') +
                '.',
            ),
            ply: worst.ply,
            quality: worst.quality,
            san: worst.san,
          },
        ]
      : [];

  return { keyMoments, patterns: [], status: 'completed', studyPlan: [], summary };
}
