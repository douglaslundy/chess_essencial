import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';

/**
 * Concrete, verifiable chess facts about one move, computed from the position with chess.js
 * (never by a language model). The review, the coach and the narration prompts all build their
 * explanations from these, so what they say about a move is what is really on the board.
 */

const VALUE: Record<PieceSymbol, number> = { b: 3, k: 0, n: 3, p: 1, q: 9, r: 5 };

export const PIECE_NAME_PT: Record<PieceSymbol, string> = {
  b: 'bispo',
  k: 'rei',
  n: 'cavalo',
  p: 'peão',
  q: 'dama',
  r: 'torre',
};

export interface PieceOnSquare {
  piece: PieceSymbol;
  square: Square;
}

export interface MoveFacts {
  /** Enemy pieces the moved piece now attacks, most valuable first (king excluded). */
  attacks: Array<PieceOnSquare & { loose: boolean }>;
  captured: PieceSymbol | null;
  castle: 'king' | 'queen' | null;
  check: boolean;
  /** The moved piece stands somewhere it can be taken at a loss. */
  exposedPiece: boolean;
  from: Square;
  /** Own pieces that became capturable at a loss because of this move (moved piece excluded). */
  leavesHanging: PieceOnSquare[];
  mate: boolean;
  /**
   * Material won by the move once the exchange on the target square plays out, in pawns
   * (captures and promotion counted, recaptures subtracted). Negative when it loses material.
   */
  netMaterial: number;
  /** Plain development of a knight or bishop from its starting square. */
  develops: boolean;
  piece: PieceSymbol;
  promotion: PieceSymbol | null;
  /** Enemy pieces that can now be won (attacked and loose, or by a cheaper piece). */
  threatens: PieceOnSquare[];
  to: Square;
  /** Pawn or knight/bishop reaching or hitting the four central squares. */
  takesCenter: boolean;
}

const KING_VALUE = 100;
const valueOf = (piece: PieceSymbol) => (piece === 'k' ? KING_VALUE : VALUE[piece]);

/**
 * Static exchange: what the side owning `attackers` nets by capturing the piece worth
 * `standing`, with both sides free to stop recapturing. Pins and x-rays are ignored.
 */
function exchangeGain(standing: number, attackers: number[], defenders: number[]): number {
  const [first, ...rest] = attackers;
  if (first === undefined) return 0;
  return Math.max(0, standing - exchangeGain(first, defenders, rest));
}

const CENTER = new Set<Square>(['d4', 'd5', 'e4', 'e5']);
const HOME_RANK: Record<Color, string> = { b: '8', w: '1' };

const opposite = (color: Color): Color => (color === 'w' ? 'b' : 'w');

function piecesOf(chess: Chess, color: Color): PieceOnSquare[] {
  const found: PieceOnSquare[] = [];
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.color === color) found.push({ piece: cell.type, square: cell.square });
    }
  }
  return found;
}

function cheapest(chess: Chess, squares: Square[]): number {
  return Math.min(...squares.map((square) => VALUE[chess.get(square)!.type] || 100));
}

/** Pieces of `color` that the opponent can take at a profit (undefended, or by a cheaper piece). */
function vulnerable(chess: Chess, color: Color): PieceOnSquare[] {
  return piecesOf(chess, color).filter(({ piece, square }) => {
    if (piece === 'k') return false;
    const attackers = chess.attackers(square, opposite(color));
    if (attackers.length === 0) return false;
    const defenders = chess.attackers(square, color);
    return defenders.length === 0 || cheapest(chess, attackers) < VALUE[piece];
  });
}

export function moveFacts(fenBefore: string, uci: string): MoveFacts | null {
  try {
    const before = new Chess(fenBefore);
    const mover = before.turn();
    const enemy = opposite(mover);
    const hangingBefore = new Set(vulnerable(before, mover).map((item) => item.square));
    const after = new Chess(fenBefore);
    const move = after.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci[4] ? { promotion: uci[4] } : {}),
    });

    const targets = piecesOf(after, enemy).filter(
      ({ piece, square }) => piece !== 'k' && after.attackers(square, mover).includes(move.to),
    );
    const enemyVulnerable = new Set(vulnerable(after, enemy).map((item) => item.square));
    const attacks = targets
      .map((target) => ({
        ...target,
        loose: after.attackers(target.square, enemy).length === 0,
      }))
      .sort((a, b) => VALUE[b.piece] - VALUE[a.piece]);
    const ownVulnerable = vulnerable(after, mover);
    const sorted = (squares: Square[]) =>
      squares.map((square) => valueOf(after.get(square)!.type)).sort((a, b) => a - b);
    const captureValue = (move.captured ? VALUE[move.captured] : 0) + (move.promotion ? 8 : 0);
    const netMaterial =
      captureValue -
      exchangeGain(
        valueOf(move.promotion ?? move.piece),
        sorted(after.attackers(move.to, enemy)),
        sorted(after.attackers(move.to, mover)),
      );

    return {
      attacks,
      captured: move.captured ?? null,
      castle: move.isKingsideCastle() ? 'king' : move.isQueensideCastle() ? 'queen' : null,
      check: after.inCheck(),
      develops:
        (move.piece === 'n' || move.piece === 'b') &&
        move.from[1] === HOME_RANK[mover] &&
        !move.captured,
      exposedPiece: ownVulnerable.some((item) => item.square === move.to),
      from: move.from,
      leavesHanging: ownVulnerable.filter(
        (item) => item.square !== move.to && !hangingBefore.has(item.square),
      ),
      mate: after.isCheckmate(),
      netMaterial,
      piece: move.piece,
      promotion: move.promotion ?? null,
      takesCenter:
        CENTER.has(move.to) ||
        ((move.piece === 'n' || move.piece === 'b') &&
          [...CENTER].some((square) => after.attackers(square, mover).includes(move.to))),
      threatens: targets.filter((target) => enemyVulnerable.has(target.square)),
      to: move.to,
    };
  } catch {
    return null;
  }
}

/** "a dama", "o cavalo": Portuguese article plus piece name. */
export const withArticle = (piece: PieceSymbol) =>
  `${piece === 'q' || piece === 'r' ? 'a' : 'o'} ${PIECE_NAME_PT[piece]}`;
const strongestFirst = (items: PieceOnSquare[]) =>
  [...items].sort((a, b) => VALUE[b.piece] - VALUE[a.piece]);

function listPieces(items: PieceOnSquare[]): string {
  const parts = items.slice(0, 2).map((item) => `${withArticle(item.piece)} em ${item.square}`);
  return parts.join(' e ');
}

/**
 * Portuguese sentences stating what the move does on the board, in the order a coach would
 * mention them: captures and checks first, then threats, then what it leaves exposed.
 */
export function describeMoveFacts(facts: MoveFacts): string[] {
  const lines: string[] = [];
  if (facts.mate) return ['Dá xeque-mate.'];
  if (facts.castle) {
    lines.push(
      `Faz o roque ${facts.castle === 'king' ? 'pequeno' : 'grande'}, deixando o rei protegido e ligando a torre ao jogo.`,
    );
  }
  if (facts.captured) {
    const won = VALUE[facts.captured];
    lines.push(
      facts.netMaterial < won
        ? `Captura ${withArticle(facts.captured)}, mas a peça pode ser recapturada: o saldo de material da troca é ${signed(facts.netMaterial)}.`
        : `Captura ${withArticle(facts.captured)} sem perder nada em troca.`,
    );
  }
  if (facts.promotion) lines.push(`Promove o peão a ${PIECE_NAME_PT[facts.promotion]}.`);
  if (facts.check) lines.push('Dá xeque, obrigando o adversário a responder.');
  const winnable = strongestFirst(facts.threatens);
  if (winnable.length > 0) {
    lines.push(`Ameaça ganhar ${listPieces(winnable)}.`);
  } else if (facts.attacks.length > 0 && !facts.check) {
    lines.push(`Ataca ${listPieces(facts.attacks)}.`);
  }
  if (facts.develops) lines.push('Desenvolve a peça, trazendo-a para o jogo.');
  else if (facts.takesCenter) lines.push('Disputa o centro do tabuleiro.');
  if (facts.exposedPiece) {
    lines.push(`Deixa ${withArticle(facts.piece)} em ${facts.to} sem proteção suficiente.`);
  }
  const hanging = strongestFirst(facts.leavesHanging);
  if (hanging.length > 0) lines.push(`Deixa ${listPieces(hanging)} vulnerável a captura.`);
  return lines;
}

const signed = (points: number) => (points > 0 ? `+${points}` : `${points}`);


const lowerFirst = (text: string) => `${text.charAt(0).toLowerCase()}${text.slice(1)}`;

function joinClauses(items: string[]): string {
  const parts = items.map((item) => lowerFirst(item.replace(/\.$/, '')));
  return parts.length < 2
    ? (parts[0] ?? '')
    : `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

/**
 * Why the engine's move beats the one played, as sentences: what the suggestion achieves, how
 * the material compares once exchanges play out, and how the evaluation moves. Only measured
 * facts; when material alone does not explain it, it says the difference is in the position.
 */
export function describeBetterMove(
  played: MoveFacts | null,
  best: MoveFacts | null,
): string[] {
  const sentences: string[] = [];
  const gains = best
    ? describeMoveFacts(best)
        .filter((line) => !line.startsWith('Deixa'))
        .slice(0, 3)
    : [];
  if (gains.length > 0) sentences.push(`O lance sugerido ${joinClauses(gains)}.`);
  if (played && best) {
    if (best.netMaterial > played.netMaterial) {
      sentences.push(
        `No saldo de material, já contando as recapturas, a sugestão rende ${signed(best.netMaterial)} e o seu lance, ${signed(played.netMaterial)}.`,
      );
    } else if (played.captured || best.captured) {
      sentences.push(
        'No material os dois lances se parecem; a diferença está na posição que fica depois deles.',
      );
    }
  }
  return sentences;
}

/** One-line goal of a recommended move, phrased as a plan ("para capturar a torre"). */
export function describeMoveGoal(facts: MoveFacts): string | null {
  if (facts.mate) return 'dar xeque-mate';
  if (facts.captured) return `capturar ${withArticle(facts.captured)}`;
  if (facts.check) return 'dar xeque';
  const winnable = strongestFirst(facts.threatens);
  if (winnable[0]) return `ameaçar ${withArticle(winnable[0].piece)} em ${winnable[0].square}`;
  if (facts.castle) return 'proteger o rei com o roque';
  if (facts.develops) return 'desenvolver a peça';
  if (facts.takesCenter) return 'disputar o centro';
  return null;
}

/** SAN (English piece letters) of a UCI move in a position, or null when it is not legal there. */
export function sanOfUci(fen: string, uci: string): string | null {
  try {
    return new Chess(fen).move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci[4] ? { promotion: uci[4] } : {}),
    }).san;
  } catch {
    return null;
  }
}
