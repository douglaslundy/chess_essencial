import type {
  GameAnalysis,
  GameMove,
  GameMoveAnalysis,
  GameNarration,
  GameNarrationKeyMoment,
  MoveQuality,
} from '@xadrez/contracts';

import {
  describeBetterMove,
  describeMoveFacts,
  describeMoveGoal,
  moveFacts,
} from '@xadrez/chess-domain';
import { Chess } from 'chess.js';

import { formatUciSquares, speakableSquares, spokenMove, toBrazilianSan } from '@/lib/notation';

export const moveQualityLabel: Record<MoveQuality, string> = {
  bom: 'Bom',
  erro: 'Erro',
  excelente: 'Excelente',
  gafe: 'Gafe',
  imprecisao: 'Imprecisão',
  otimo: 'Ótimo',
};

/** Short label shown in the move's speech-bubble panel, e.g. "Bom · -35cp". */
export function describeMoveQuality(move: GameMoveAnalysis): string {
  const label = moveQualityLabel[move.quality];
  if (move.centipawnLoss <= 0) return label;
  return `${label} · -${move.centipawnLoss}cp`;
}

export function shouldNarrateReviewMove(
  move: GameMoveAnalysis | null,
  myColor: 'white' | 'black' | null,
): boolean {
  return move !== null && myColor !== null && move.color === myColor;
}

export function narrationTextForPlayer(
  narration: GameNarration,
  myColor: 'white' | 'black' | null,
): string {
  const playerMoments = myColor
    ? narration.keyMoments.filter((moment) => moment.color === myColor)
    : [];
  return [narration.summary, ...playerMoments.map((moment) => moment.narrative)]
    .filter(Boolean)
    .join(' ');
}

// Spoken (not label) form, so the sentence reads like a coach talking.
const spokenQuality: Record<MoveQuality, string> = {
  bom: 'um lance bom',
  erro: 'e eu considero isso um erro',
  excelente: 'um lance excelente',
  gafe: 'e infelizmente isso foi uma gafe',
  imprecisao: 'uma pequena imprecisão',
  otimo: 'um ótimo lance',
};

type MoveToExplain = Pick<GameMove, 'fenBefore' | 'san' | 'uci'>;

function sanOfUci(fenBefore: string, uci: string): string | null {
  try {
    return new Chess(fenBefore).move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci[4] ? { promotion: uci[4] } : {}),
    }).san;
  } catch {
    return null;
  }
}

/**
 * What a chess coach would say about a move, built from facts read off the board
 * (`moveFacts`, shared with the server prompts) and from the engine verdict: what the move does,
 * what it leaves exposed, and, for a weak move, what to play instead and why.
 * `speech` spells the move out ("Cavalo para c3"); `text` keeps the notation ("Cc3").
 */
export function explainMove(
  played: MoveToExplain,
  analysis: GameMoveAnalysis | null,
  mode: 'text' | 'speech',
): string {
  const name = (san: string, uci: string) =>
    mode === 'speech' ? spokenMove(played.fenBefore, uci) : toBrazilianSan(san);
  const quality = analysis?.quality ?? null;
  const weak = quality === 'imprecisao' || quality === 'erro' || quality === 'gafe';
  const sentences = [
    quality
      ? `Você jogou ${name(played.san, played.uci)}, ${spokenQuality[quality]}.`
      : `Você jogou ${name(played.san, played.uci)}.`,
  ];

  const facts = moveFacts(played.fenBefore, played.uci);
  const lines = facts ? describeMoveFacts(facts) : [];
  // A weak move is explained by what it gives away first; a good one by what it achieves.
  if (weak) lines.sort((a, b) => Number(b.startsWith('Deixa')) - Number(a.startsWith('Deixa')));
  sentences.push(...lines.slice(0, 3));

  if (analysis && weak) {
    const giveaway = lines.some((line) => line.startsWith('Deixa'));
    if (!giveaway && analysis.centipawnLoss >= 150) {
      sentences.push('Com ele você entrega boa parte da vantagem que tinha na posição.');
    }
    const bestUci = analysis.bestMoveUci;
    const best = bestUci ? sanOfUci(played.fenBefore, bestUci) : null;
    if (best && bestUci) {
      sentences.push(`No seu lugar, eu jogaria ${name(best, bestUci)}.`);
      // Why it is better: what it does, the material once exchanges play out.
      sentences.push(...describeBetterMove(facts, moveFacts(played.fenBefore, bestUci)));
    }
  }
  // Names the move as one of the game's strong or weak points, the same labels as the review summary.
  const goal = facts ? describeMoveGoal(facts) : null;
  if (weak) {
    const reason = lines.find((line) => line.startsWith('Deixa'));
    sentences.push(
      reason
        ? `Ponto fraco: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`
        : 'Ponto fraco: lance que cede parte da vantagem.',
    );
  } else if ((quality === 'otimo' || quality === 'excelente') && goal) {
    sentences.push(`Ponto forte: ${goal}.`);
  }
  return sentences.join(' ');
}

export interface ReviewComment {
  /** Shown in the Treinador's bubble. */
  text: string;
  /** Read aloud by the voice. */
  speech: string;
}

/**
 * Treinador's comment for the reviewed ply: the AI key-moment narrative when one exists,
 * else the board-based explanation, so every move of the player gets a real comment, even
 * while the analysis is still running. Null for the opponent's moves.
 */
export function reviewMoveComment(
  move: Pick<GameMove, 'color' | 'fenBefore' | 'ply' | 'san' | 'uci'> | null,
  analysis: GameMoveAnalysis | null,
  keyMoments: GameNarrationKeyMoment[],
  myColor: 'white' | 'black' | null,
): ReviewComment | null {
  if (!move || !myColor || move.color !== myColor) return null;
  const moment = keyMoments.find((item) => item.ply === move.ply && item.color === myColor);
  if (moment?.narrative)
    return { speech: speakableSquares(moment.narrative), text: moment.narrative };
  return {
    speech: speakableSquares(explainMove(move, analysis, 'speech')),
    text: explainMove(move, analysis, 'text'),
  };
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
  moves: Array<Pick<GameMove, 'fenBefore' | 'ply' | 'san' | 'uci'>> = [],
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

  const worstPlayed = worst ? moves.find((item) => item.ply === worst.ply) : undefined;
  const keyMoments: GameNarrationKeyMoment[] =
    worst && worst.centipawnLoss > 0
      ? [
          {
            color: worst.color,
            narrative: worstPlayed
              ? `O momento mais importante foi o lance ${worst.ply}. ${explainMove(worstPlayed, worst, 'speech')}`
              : speakableSquares(
                  `No lance ${worst.ply}, ${toBrazilianSan(worst.san)} foi classificado como ${moveQualityLabel[worst.quality].toLowerCase()}` +
                    (worst.bestMoveUci
                      ? `; eu indicaria ${formatUciSquares(worst.bestMoveUci)}`
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
