export type MoveQuality = 'otimo' | 'excelente' | 'bom' | 'imprecisao' | 'erro' | 'gafe';

export interface MoveQualityInput {
  /** Forced mate distance from the mover's perspective before the move (positive = mover mates, negative = mover gets mated), or null. */
  mateBefore: number | null;
  /** Forced mate distance from the mover's perspective after the move, or null. */
  mateAfter: number | null;
  /**
   * Eval in centipawns from the mover's perspective, before the move (the
   * best-play evaluation of the position the mover was facing).
   */
  scoreBeforeCp: number | null;
  /**
   * Eval in centipawns from the mover's perspective, after the move was
   * played. Engines report scores from the side to move, which flips to the
   * opponent after a move — callers must negate the engine's raw score
   * before passing it here.
   */
  scoreAfterCp: number | null;
  /**
   * The move played is the engine's best move. The two evaluations come from separate searches,
   * so their difference is search noise, not a loss: such a move is always "ótimo".
   */
  playedBestMove?: boolean;
}

export interface MoveQualityResult {
  /** Centipawn loss versus the best available move, clamped to [0, 1000]. */
  centipawnLoss: number;
  /**
   * A materially better (often winning or mating) alternative was available
   * and not taken, even though the position after the move isn't itself
   * lost. Tracked independently of `quality` for the "oportunidades
   * perdidas" tally, since a missed win can co-occur with any quality band.
   */
  missedWin: boolean;
  quality: MoveQuality;
}

/** A forced mate is treated as this far better/worse than any centipawn score. */
const MATE_SCORE = 100_000;
const CENTIPAWN_LOSS_DISPLAY_CAP = 1000;
const MISSED_OPPORTUNITY_MIN_LOSS_CP = 150;
const MISSED_OPPORTUNITY_MIN_RESULTING_SCORE_CP = -50;

const QUALITY_BANDS: ReadonlyArray<{ maxLossCp: number; quality: MoveQuality }> = [
  { maxLossCp: 10, quality: 'otimo' },
  { maxLossCp: 20, quality: 'excelente' },
  { maxLossCp: 50, quality: 'bom' },
  { maxLossCp: 100, quality: 'imprecisao' },
  { maxLossCp: 300, quality: 'erro' },
  { maxLossCp: Infinity, quality: 'gafe' },
];

function effectiveScore(scoreCp: number | null, mate: number | null): number {
  if (mate !== null) return mate > 0 ? MATE_SCORE : -MATE_SCORE;
  return scoreCp ?? 0;
}

export function classifyMove(input: MoveQualityInput): MoveQualityResult {
  if (input.playedBestMove) return { centipawnLoss: 0, missedWin: false, quality: 'otimo' };
  const before = effectiveScore(input.scoreBeforeCp, input.mateBefore);
  const after = effectiveScore(input.scoreAfterCp, input.mateAfter);
  const rawLoss = before - after;
  const centipawnLoss = Math.min(Math.max(rawLoss, 0), CENTIPAWN_LOSS_DISPLAY_CAP);

  const band = QUALITY_BANDS.find((candidate) => centipawnLoss <= candidate.maxLossCp);
  const quality = band ? band.quality : 'gafe';

  const missedWin =
    rawLoss >= MISSED_OPPORTUNITY_MIN_LOSS_CP && after >= MISSED_OPPORTUNITY_MIN_RESULTING_SCORE_CP;

  return { centipawnLoss, missedWin, quality };
}
