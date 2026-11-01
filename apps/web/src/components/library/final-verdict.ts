import type { Chess } from 'chess.js';

export interface FinalVerdict {
  outcome: 'win' | 'draw';
  title: string;
  detail: string;
}

/**
 * Library PGNs carry only the result tag, so the reason comes from the final position:
 * a decisive game that does not end in mate is read as a resignation.
 */
export function finalVerdict(result: string, finalPosition: Chess): FinalVerdict | null {
  if (result === '1-0' || result === '0-1') {
    const winner = result === '1-0' ? 'Brancas' : 'Pretas';
    const loser = result === '1-0' ? 'pretas' : 'brancas';
    return {
      detail: finalPosition.isCheckmate()
        ? `${winner} venceram por xeque-mate.`
        : `As ${loser} desistiram.`,
      outcome: 'win',
      title: `${winner} venceram`,
    };
  }
  if (result === '1/2-1/2') {
    const detail = finalPosition.isStalemate()
      ? 'Empate por afogamento.'
      : finalPosition.isInsufficientMaterial()
        ? 'Empate por material insuficiente.'
        : finalPosition.isThreefoldRepetition()
          ? 'Empate por repetição de posição.'
          : 'Empate por acordo.';
    return { detail, outcome: 'draw', title: 'Empate' };
  }
  return null;
}
