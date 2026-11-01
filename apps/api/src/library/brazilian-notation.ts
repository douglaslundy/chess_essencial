import type { LibraryReviewEntry } from '@xadrez/contracts';

// The PGN moves sent to the AI are English SAN, so its comments quote moves as "Kf1", "Qxd5".
// Brazilian notation: Rei(R), Dama(D), Torre(T), Bispo(B), Cavalo(C).
const PIECE_PT: Record<string, string> = { K: 'R', N: 'C', Q: 'D', R: 'T' };

/** Rewrites English SAN moves quoted inside free text into Brazilian notation ("Kf1" → "Rf1"). */
export function toBrazilianNotation(text: string): string {
  return text
    .replace(
      /\b([KQRN])(?=[a-h]?[1-8]?x?[a-h][1-8])/g,
      (_match, letter: string) => PIECE_PT[letter]!,
    )
    .replace(/(?<=[a-h][18])=([QRN])/g, (_match, letter: string) => `=${PIECE_PT[letter]}`);
}

/** Converts every free-text field; `better` stays SAN because the web translates it itself. */
export function withBrazilianNotation(entry: LibraryReviewEntry): LibraryReviewEntry {
  const convert = (value: string | null) => (value === null ? null : toBrazilianNotation(value));
  return {
    ...entry,
    betterWhy: convert(entry.betterWhy),
    expect: convert(entry.expect),
    strength: convert(entry.strength),
    summary: toBrazilianNotation(entry.summary),
    weakness: convert(entry.weakness),
    why: toBrazilianNotation(entry.why),
  };
}
