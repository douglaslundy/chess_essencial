import { Chess } from 'chess.js';

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

const PIECE_NAME_SPOKEN: Record<string, string> = {
  B: 'Bispo',
  K: 'Rei',
  N: 'Cavalo',
  Q: 'Dama',
  R: 'Torre',
};

/**
 * Reads a chess.js SAN move the way a coach says it, e.g. "Nf3" → "Cavalo para f3",
 * "exd5" → "Peão de e captura em d5", "O-O" → "roque pequeno". Squares stay plain
 * ("f3"): run the result through `speakableSquares` before speaking it.
 */
export function spokenSan(san: string, squares?: { from: string; to: string }): string {
  const castling = /^[O0]-[O0](-[O0])?/.exec(san);
  if (castling) return `${castling[1] ? 'Roque grande' : 'Roque pequeno'}${checkSuffix(san)}`;
  const match = /^([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=([KQRBN]))?[+#]?$/.exec(san);
  if (!match) return san;
  const [, piece, file, rank, capture, square, promotion] = match;
  let sentence: string;
  if (squares) {
    // "o bispo de b1 para h6": the piece and both squares, which is how a coach says it.
    const who = piece ? PIECE_PHRASE[piece] : 'o peão';
    sentence = `${who} de ${squares.from} ${capture ? 'captura em' : 'para'} ${squares.to}`;
  } else if (piece) {
    const from = file ? ` da coluna ${FILE_NAME_PT[file]}` : rank ? ` da linha ${rank}` : '';
    sentence = `${PIECE_NAME_SPOKEN[piece]}${from} ${capture ? 'captura em' : 'para'} ${square}`;
  } else if (capture) {
    sentence = `Peão de ${FILE_NAME_PT[file ?? 'a']} captura em ${square}`;
  } else {
    sentence = `Peão para ${square}`;
  }
  if (promotion) sentence += ` e promove a ${PIECE_NAME_SPOKEN[promotion]!.toLowerCase()}`;
  return `${sentence}${checkSuffix(san)}`;
}

const PIECE_PHRASE: Record<string, string> = {
  B: 'o bispo',
  K: 'o rei',
  N: 'o cavalo',
  Q: 'a dama',
  R: 'a torre',
};

/** Spoken form of the UCI move played from `fenBefore` ("o bispo de b1 para h6"); the SAN when illegal. */
export function spokenMove(fenBefore: string, uci: string): string {
  try {
    const move = new Chess(fenBefore).move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci[4] ? { promotion: uci[4] } : {}),
    });
    return spokenSan(move.san, { from: move.from, to: move.to });
  } catch {
    return uci;
  }
}

function checkSuffix(san: string): string {
  return san.endsWith('#') ? ', xeque-mate' : san.endsWith('+') ? ', xeque' : '';
}

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
