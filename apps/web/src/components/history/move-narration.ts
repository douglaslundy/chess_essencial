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
  analysis: Pick<GameMoveAnalysis, 'bestMoveUci' | 'centipawnLoss' | 'quality'> | null,
  mode: 'text' | 'speech',
  /** Who played it: the reviewer ("você") or the other side, named by `subject`. */
  side: 'player' | 'opponent' = 'player',
  subject = 'O adversário',
): string {
  const mine = side === 'player';
  const name = (san: string, uci: string) =>
    mode === 'speech' ? spokenMove(played.fenBefore, uci) : toBrazilianSan(san);
  const bestUci = analysis?.bestMoveUci ?? null;
  // Analyses stored before the worker fix graded the best move itself by search noise.
  const quality = bestUci === played.uci ? 'otimo' : (analysis?.quality ?? null);
  const weak = quality === 'imprecisao' || quality === 'erro' || quality === 'gafe';
  const sentences = [
    quality
      ? `${mine ? 'Você' : subject} jogou ${name(played.san, played.uci)}, ${spokenQuality[quality]}.`
      : `${mine ? 'Você' : subject} jogou ${name(played.san, played.uci)}.`,
  ];

  const facts = moveFacts(played.fenBefore, played.uci);
  const lines = facts ? describeMoveFacts(facts) : [];
  const gives = lines.filter((line) => line.startsWith('Deixa'));
  const does = lines.filter((line) => !line.startsWith('Deixa'));

  if (weak) {
    sentences.push(...does.slice(0, 2));
    const bestFacts = bestUci ? moveFacts(played.fenBefore, bestUci) : null;
    const best = bestUci ? sanOfUci(played.fenBefore, bestUci) : null;
    const bestGoal = bestFacts ? describeMoveGoal(bestFacts) : null;
    const missed = bestGoal && bestGoal !== (facts ? describeMoveGoal(facts) : null);
    // Ponto fraco always says what the move gives away, read off the board, never a bare verdict.
    const reason = gives[0]
      ? lowerFirst(gives[0].replace(/\.$/, ''))
      : missed
        ? `deixa passar a chance de ${bestGoal}`
        : facts && facts.netMaterial < 0
          ? 'perde material na troca'
          : 'não perde material, mas deixa a posição pior do que o lance sugerido';
    sentences.push(`Ponto fraco: ${reason}.`);
    if (best && bestUci) {
      sentences.push(
        `${mine ? 'No seu lugar' : 'No lugar dele'}, eu jogaria ${name(best, bestUci)}.`,
      );
      const why = describeBetterMove(facts, bestFacts);
      // The missed chance already says what the suggestion does.
      sentences.push(...(missed ? why.filter((line) => !line.startsWith('O lance')) : why));
    }
  } else if (quality === 'otimo' || quality === 'excelente') {
    const verdict = quality === 'otimo' ? 'é o melhor lance aqui' : 'é um dos melhores lances aqui';
    const [why, ...rest] = does;
    sentences.push(
      why
        ? `Ponto forte: ${verdict}, porque ${lowerFirst(why.replace(/\.$/, ''))}.`
        : `Ponto forte: ${verdict}.`,
      ...rest.slice(0, 1),
      ...gives.slice(0, 1),
    );
  } else {
    sentences.push(...lines.slice(0, 3));
  }
  return sentences.join(' ');
}

const lowerFirst = (text: string) => `${text.charAt(0).toLowerCase()}${text.slice(1)}`;

export interface ReviewComment {
  /** Shown in the Treinador's bubble. */
  text: string;
  /** Read aloud by the voice. */
  speech: string;
}

/**
 * Treinador's comment for the reviewed ply: the AI key-moment narrative when one exists,
 * else the board-based explanation, so every move of the player gets a real comment, even
 * while the analysis is still running. The other side's moves get the same board-based
 * evaluation (good move, blunder, strong and weak points), worded about the opponent.
 */
export function reviewMoveComment(
  move: Pick<GameMove, 'color' | 'fenBefore' | 'ply' | 'san' | 'uci'> | null,
  analysis: GameMoveAnalysis | null,
  keyMoments: GameNarrationKeyMoment[],
  myColor: 'white' | 'black' | null,
): ReviewComment | null {
  if (!move || !myColor) return null;
  const mine = move.color === myColor;
  // The AI key moments are written about the student's own moves.
  const moment = mine
    ? keyMoments.find((item) => item.ply === move.ply && item.color === myColor)
    : undefined;
  if (moment?.narrative)
    return { speech: speakableSquares(moment.narrative), text: moment.narrative };
  const side = mine ? 'player' : 'opponent';
  return {
    speech: speakableSquares(explainMove(move, analysis, 'speech', side)),
    text: explainMove(move, analysis, 'text', side),
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
