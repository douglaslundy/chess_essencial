import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';

const pieceValue: Record<PieceSymbol, number> = {
  b: 330,
  k: 0,
  n: 320,
  p: 100,
  q: 900,
  r: 500,
};

const CENTER_SQUARES = new Set<Square>(['d4', 'd5', 'e4', 'e5']);

function uci(move: Move) {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

/**
 * Material balance plus small positional terms (center control, mobility) so
 * quiet non-capturing moves are not all scored as ties. Positional weights
 * stay well below a pawn's value so material always dominates when it
 * differs; they only break ties between materially-equal candidates.
 */
function evaluate(chess: Chess, perspective: Color) {
  if (chess.isCheckmate()) return chess.turn() === perspective ? -100_000 : 100_000;
  if (chess.isDraw()) return 0;

  let white = 0;
  let black = 0;
  for (const rank of chess.board()) {
    for (const piece of rank) {
      if (!piece) continue;
      const value = pieceValue[piece.type] + (CENTER_SQUARES.has(piece.square) ? 10 : 0);
      if (piece.color === 'w') white += value;
      else black += value;
    }
  }
  const material = white - black;

  const turnColor = chess.turn();
  const mobility = chess.moves().length * (turnColor === 'w' ? 1 : -1);

  const score = material + mobility;
  return perspective === 'w' ? score : -score;
}

function scoreMove(fen: string, move: Move, perspective: Color, searchReply: boolean) {
  const chess = new Chess(fen);
  chess.move(move);
  let score = evaluate(chess, perspective);
  if (!searchReply || chess.isGameOver()) return score;

  const replies = chess.moves({ verbose: true });
  if (replies.length === 0) return score;
  score = Math.min(
    ...replies.map((reply) => {
      const response = new Chess(chess.fen());
      response.move(reply);
      return evaluate(response, perspective);
    }),
  );
  return score;
}

/**
 * Selects a legal server-side move. Strength controls both how many
 * inferior candidates remain eligible and whether the bot looks one ply
 * ahead to avoid moves that immediately lose material to the opponent's
 * best reply (`searchReply`). Only the weakest band (< 900, "beginner")
 * skips evaluation entirely and blunders freely; every other band checks
 * the opponent's reply so difficulty differences are visible even in
 * quiet, non-capturing positions.
 */
export function selectBotMove(
  fen: string,
  strength: number,
  random: () => number = Math.random,
): string {
  const chess = new Chess(fen);
  const perspective = chess.turn();
  const legal = chess.moves({ verbose: true });
  if (legal.length === 0) throw new Error('No legal bot move is available');

  if (strength < 900) {
    return uci(legal[Math.min(legal.length - 1, Math.floor(random() * legal.length))]!);
  }

  const searchReply = strength >= 900;
  const scored = legal
    .map((move) => ({ move, score: scoreMove(fen, move, perspective, searchReply) }))
    .sort(
      (left, right) => right.score - left.score || uci(left.move).localeCompare(uci(right.move)),
    );
  const candidateCount = strength < 1300 ? Math.ceil(scored.length / 3) : strength < 1700 ? 2 : 1;
  const candidates = scored.slice(0, Math.max(1, candidateCount));
  return uci(
    candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))]!.move,
  );
}
