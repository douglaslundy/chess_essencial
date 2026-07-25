// chess.js always generates SAN with English piece letters (K,Q,R,B,N).
// Brazilian Portuguese chess notation uses different letters for every
// piece except the bishop: Rei(R), Dama(D), Torre(T), Bispo(B), Cavalo(C).
// This only relabels the piece letter — squares, captures ("x"), checks
// ("+"/"#"), castling ("O-O") and promotion suffixes stay the same shape.
const PIECE_LETTER_PT: Record<string, string> = { B: 'B', K: 'R', N: 'C', Q: 'D', R: 'T' };

/** Translates a chess.js SAN string to Brazilian Portuguese notation, e.g. "Qxe4+" → "Dxe4+". */
export function toBrazilianSan(san: string): string {
  return san
    .replace(/^[KQRBN]/, (letter) => PIECE_LETTER_PT[letter]!)
    .replace(/=([KQRBN])/, (_match, letter: string) => `=${PIECE_LETTER_PT[letter]}`);
}

/** Formats a UCI move ("e2e4") as a readable square pair for display: "e2 → e4". */
export function formatUciSquares(uci: string): string {
  return `${uci.slice(0, 2)} → ${uci.slice(2, 4)}`;
}
