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

// Bare "letter+digit" square tokens (e.g. "g6") have no natural pronunciation
// in Portuguese, so some pt-BR speech-synthesis voices guess a nonsense word
// instead of reading the letter name (observed: "g6" spoken as "grandma 6").
// Spelling the file letter out removes the ambiguity.
const FILE_NAME_PT: Record<string, string> = {
  a: 'á',
  b: 'bê',
  c: 'cê',
  d: 'dê',
  e: 'é',
  f: 'éfe',
  g: 'gê',
  h: 'agá',
};

/** Rewrites any square references in speech-bound text into a phonetically
 * safe, spelled-out form, e.g. "g6" → "gê 6". Use for any string passed to
 * speech synthesis; not for on-screen display. */
export function speakableSquares(text: string): string {
  return (
    text
      // Castling SAN ("O-O", "O-O-O", also typed with zeros) is read letter by letter otherwise.
      .replace(/(?<![\w-])[O0]-[O0]-[O0](?![\w-])/g, 'roque grande')
      .replace(/(?<![\w-])[O0]-[O0](?![\w-])/g, 'roque pequeno')
      .replace(
        /([a-h])([1-8])/g,
        (_match, file: string, rank: string) => ` ${FILE_NAME_PT[file]} ${rank}`,
      )
      .replace(/\s+/g, ' ')
      .trim()
  );
}
