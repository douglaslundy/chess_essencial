export interface LineGrade {
  movesConfirmed: number;
  opponentReply: string | null;
  status: 'continue' | 'solved' | 'incorrect';
}

function normalize(move: string) {
  return move.trim().toLowerCase();
}

/**
 * Grade the player's moves so far against the exercise solution lines.
 *
 * Each solution line is interleaved `[player, opponent, player, ...]`, so the
 * player owns the even indices. `playedMoves` contains only the player's moves
 * (the opponent replies are deduced by the server, never sent by the client).
 */
export function gradePlayedMoves(solutionLines: string[][], playedMoves: string[]): LineGrade {
  const played = playedMoves.map(normalize);

  const candidates = solutionLines.filter((line) => {
    const playerMoves = line.filter((_, index) => index % 2 === 0).map(normalize);
    if (played.length > playerMoves.length) return false;
    return played.every((move, index) => move === playerMoves[index]);
  });

  if (candidates.length === 0) {
    return { status: 'incorrect', opponentReply: null, movesConfirmed: played.length };
  }

  const solvedLine = candidates.find((line) => {
    const playerMoves = line.filter((_, index) => index % 2 === 0);
    return played.length === playerMoves.length && line.length === played.length * 2 - 1;
  });
  if (solvedLine) {
    return { status: 'solved', opponentReply: null, movesConfirmed: played.length };
  }

  const opponentIndex = played.length * 2 - 1;
  const reply = candidates
    .map((line) => line[opponentIndex])
    .find((move): move is string => Boolean(move));

  return {
    status: 'continue',
    opponentReply: reply ? normalize(reply) : null,
    movesConfirmed: played.length,
  };
}

const PIECE_NAMES: Record<string, string> = {
  b: 'o bispo',
  k: 'o rei',
  n: 'o cavalo',
  p: 'o peão',
  q: 'a dama',
  r: 'a torre',
};

/** Hint for an exercise without registered hints: names the piece of the first solution move. */
export function fallbackHint(fen: string, solutionLines: string[][]): string | null {
  const from = solutionLines[0]?.[0]?.trim().toLowerCase().slice(0, 2);
  if (!from || !/^[a-h][1-8]$/.test(from)) return null;
  const rank = fen.split(' ')[0]?.split('/')[8 - Number(from[1])];
  if (!rank) return null;
  let file = 0;
  for (const char of rank) {
    if (/\d/.test(char)) file += Number(char);
    else if (file++ === from.charCodeAt(0) - 97) {
      const piece = PIECE_NAMES[char.toLowerCase()];
      return piece ? `Comece com ${piece} que está em ${from}.` : null;
    }
  }
  return null;
}
