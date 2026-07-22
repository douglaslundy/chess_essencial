import { Chess, type Move } from 'chess.js';

// A small forced-mate solver used to generate and verify tactical puzzles.
// "Attacker" is the side to move in the given position.

function uci(move: Move): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

/**
 * Is `fen` a legal, non-terminal position with the side to move having at
 * least one legal move? Used by the puzzle generator to filter random boards.
 */
export function isPlayableStart(fen: string): boolean {
  try {
    const chess = new Chess(fen);
    if (chess.isGameOver()) return false;
    if (chess.moves().length === 0) return false;
    // Reject illegal positions where the side NOT to move is left in check
    // (chess.js loads these but they are not real game positions).
    const parts = fen.split(' ');
    const opponent = parts[1] === 'w' ? 'b' : 'w';
    const flipped = new Chess([parts[0], opponent, '-', '-', '0', '1'].join(' '));
    if (flipped.inCheck()) return false;
    return true;
  } catch {
    return false;
  }
}

/** Does the side to move have at least one move that gives check? */
export function hasCheckingMove(fen: string): boolean {
  const chess = new Chess(fen);
  for (const move of chess.moves({ verbose: true })) {
    chess.move(move);
    const check = chess.inCheck();
    chess.undo();
    if (check) return true;
  }
  return false;
}

/**
 * Does the side to move have a forced mate in at most `n` of their own moves
 * against every defence?
 */
export function forcedMateInAtMost(chess: Chess, n: number): boolean {
  if (n < 1) return false;
  for (const move of chess.moves({ verbose: true })) {
    chess.move(move);
    try {
      if (chess.isCheckmate()) return true;
      if (n >= 2 && !chess.isStalemate() && !chess.isDraw()) {
        const replies = chess.moves({ verbose: true });
        if (replies.length > 0) {
          const allRepliesLoseFast = replies.every((reply) => {
            chess.move(reply);
            try {
              return forcedMateInAtMost(chess, n - 1);
            } finally {
              chess.undo();
            }
          });
          if (allRepliesLoseFast) return true;
        }
      }
    } finally {
      chess.undo();
    }
  }
  return false;
}

/**
 * Attacker first moves (UCI) that force mate in exactly `n`. "Exactly n" means
 * it forces mate in at most n but the position is not already mate in n-1.
 */
export function findMateFirstMoves(fen: string, n: number, checkFirstOnly = false): string[] {
  if (n >= 1 && forcedMateInAtMost(new Chess(fen), n - 1)) return [];
  const base = new Chess(fen);
  const results: string[] = [];
  for (const move of base.moves({ verbose: true })) {
    base.move(move);
    try {
      if (checkFirstOnly && !base.isCheck() && !base.isCheckmate()) {
        continue;
      }
      if (n === 1) {
        if (base.isCheckmate()) results.push(uci(move));
      } else if (!base.isStalemate() && !base.isDraw()) {
        const replies = base.moves({ verbose: true });
        if (
          replies.length > 0 &&
          replies.every((reply) => {
            base.move(reply);
            try {
              return forcedMateInAtMost(base, n - 1);
            } finally {
              base.undo();
            }
          })
        ) {
          results.push(uci(move));
        }
      }
    } finally {
      base.undo();
    }
  }
  return results;
}

/**
 * Build interleaved [attacker, defender, attacker, ...] UCI solution lines for
 * a position with a forced mate in exactly `n`, given the first move. One line
 * per defender reply branch. Returns null if any branch is not a clean forced
 * mate.
 */
export function buildSolutionLines(
  fen: string,
  n: number,
  firstMove: string,
  checkFirstOnly = false,
): string[][] | null {
  const chess = new Chess(fen);
  const applied = chess.move({
    from: firstMove.slice(0, 2),
    to: firstMove.slice(2, 4),
    promotion: firstMove[4] as never,
  });
  if (!applied) return null;
  if (n === 1) {
    return chess.isCheckmate() ? [[firstMove]] : null;
  }
  const lines: string[][] = [];
  for (const reply of chess.moves({ verbose: true })) {
    chess.move(reply);
    try {
      const continuations = findMateFirstMoves(chess.fen(), n - 1, checkFirstOnly);
      if (continuations.length === 0) return null;
      const sub = buildSolutionLines(chess.fen(), n - 1, continuations[0]!, checkFirstOnly);
      if (!sub) return null;
      for (const line of sub) lines.push([firstMove, uci(reply), ...line]);
    } finally {
      chess.undo();
    }
  }
  return lines.length > 0 ? lines : null;
}
