type ReviewableGame = { status: string; termination: string };

export type ReviewEligibility =
  | { available: true; reason: null; shortLabel: null }
  | { available: false; reason: string; shortLabel: string };

export function reviewEligibility(game: ReviewableGame): ReviewEligibility {
  if (game.termination === 'resignation') {
    return {
      available: false,
      reason: 'Esta partida foi encerrada por desistência e não possui revisão disponível.',
      shortLabel: 'Sem revisão · desistência',
    };
  }
  if (game.termination === 'abandonment') {
    return {
      available: false,
      reason: 'Esta partida foi encerrada por abandono e não possui revisão disponível.',
      shortLabel: 'Sem revisão · abandono',
    };
  }
  if (game.status !== 'finished') {
    return {
      available: false,
      reason: 'A revisão fica disponível somente depois que a partida termina no tabuleiro.',
      shortLabel: 'Revisão após o término',
    };
  }
  return { available: true, reason: null, shortLabel: null };
}
