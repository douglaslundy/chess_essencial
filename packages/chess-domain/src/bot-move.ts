import { Chess, type Color, type Move, type PieceSymbol } from 'chess.js';

const pieceValue: Record<PieceSymbol, number> = {
  b: 330,
  k: 0,
  n: 320,
  p: 100,
  q: 900,
  r: 500,
};

function uci(move: Move) {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

function evaluate(chess: Chess, perspective: Color) {
  if (chess.isCheckmate()) return chess.turn() === perspective ? -100_000 : 100_000;
  if (chess.isDraw()) return 0;

  let white = 0;
  let black = 0;
  for (const rank of chess.board()) {
    for (const piece of rank) {
      if (!piece) continue;
      if (piece.color === 'w') white += pieceValue[piece.type];
      else black += pieceValue[piece.type];
    }
  }
  const material = white - black;
  return perspective === 'w' ? material : -material;
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

/** Selects a legal server-side move. Strength controls how many inferior candidates remain eligible. */
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

  const scored = legal
    .map((move) => ({ move, score: scoreMove(fen, move, perspective, strength >= 1800) }))
    .sort(
      (left, right) => right.score - left.score || uci(left.move).localeCompare(uci(right.move)),
    );
  const candidateCount = strength < 1300 ? Math.ceil(scored.length / 2) : strength < 1700 ? 3 : 1;
  const candidates = scored.slice(0, Math.max(1, candidateCount));
  return uci(
    candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))]!.move,
  );
}
