import { Chess } from 'chess.js';

import type { CourseStep } from './course-types';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export interface StepState {
  fen: string;
  moves: number;
  /** Stars still on the board (stars steps only). */
  stars: string[];
  status: 'playing' | 'done';
  /** Coach reaction to the last move, or null. */
  feedback: string | null;
  lastMove: { from: string; to: string } | null;
}

export function initialStepState(step: CourseStep): StepState {
  return {
    fen: ('fen' in step ? step.fen : undefined) ?? START_FEN,
    moves: 0,
    stars: step.kind === 'stars' ? [...step.stars] : [],
    status: step.kind === 'info' ? 'done' : 'playing',
    feedback: null,
    lastMove: null,
  };
}

/** Keeps the student's side to move (stars steps have no opponent moves). */
function sameSideToMove(fen: string, side: string): string {
  const fields = fen.split(' ');
  fields[1] = side;
  fields[3] = '-';
  return fields.join(' ');
}

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

/** Course defender: grabs the most valuable loose piece, otherwise runs its king to the center. */
export function defenderReply(chess: Chess) {
  let best = null;
  let bestScore = -Infinity;
  for (const move of chess.moves({ verbose: true })) {
    const file = move.to.charCodeAt(0) - 97;
    const rank = Number(move.to[1]) - 1;
    const center = move.piece === 'k' ? -(Math.abs(file - 3.5) + Math.abs(rank - 3.5)) : 0;
    const score = (move.captured ? PIECE_VALUE[move.captured]! * 100 : 0) + center;
    if (score > bestScore) [best, bestScore] = [move, score];
  }
  if (!best) return null;
  chess.move(best);
  return { from: best.from, to: best.to };
}

/** Applies the student's move. Returns null for an illegal move (the board ignores it). */
export function applyCourseMove(step: CourseStep, state: StepState, uci: string): StepState | null {
  // Puzzle moves are graded by the server (course-puzzle.tsx).
  if (step.kind === 'info' || step.kind === 'puzzle' || state.status === 'done') return null;
  const chess = new Chess(state.fen);
  const side = chess.turn();
  let move;
  try {
    move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' });
  } catch {
    return null;
  }
  // Stars steps never hand the turn over, so a checked king could be "captured".
  if (move.captured === 'k') return null;
  const lastMove = { from: move.from, to: move.to };
  const moves = state.moves + 1;

  if (step.kind === 'stars') {
    const stars = state.stars.filter((square) => square !== move.to);
    if (stars.length === 0) {
      return { ...state, fen: chess.fen(), feedback: null, lastMove, moves, stars, status: 'done' };
    }
    if (step.maxMoves !== undefined && moves >= step.maxMoves) {
      return {
        ...initialStepState(step),
        feedback: `Você usou ${moves} lances e ainda faltam estrelas. Tente de novo.`,
      };
    }
    return {
      ...state,
      fen: sameSideToMove(chess.fen(), side),
      feedback: null,
      lastMove,
      moves,
      stars,
    };
  }

  if (step.kind === 'move') {
    const played = `${move.from}${move.to}`;
    if (!step.accept.some((accepted) => accepted.slice(0, 4) === played)) {
      return { ...state, feedback: 'Esse não é o lance pedido. Tente de novo.' };
    }
    let reply = lastMove;
    if (step.reply) {
      const answer = chess.move({ from: step.reply.slice(0, 2), to: step.reply.slice(2, 4) });
      reply = { from: answer.from, to: answer.to };
    }
    return { ...state, fen: chess.fen(), feedback: null, lastMove: reply, moves, status: 'done' };
  }

  if (step.kind === 'checkmate') {
    if (chess.isCheckmate()) {
      return { ...state, fen: chess.fen(), feedback: null, lastMove, moves, status: 'done' };
    }
    const failure = chess.isStalemate()
      ? 'Afogou! O rei não está em xeque e não tem lance: é empate. Recomeçando.'
      : chess.isDraw()
        ? 'A partida empatou. Recomeçando.'
        : moves >= step.maxMoves
          ? `Você tinha ${step.maxMoves} lances para dar o mate. Recomeçando.`
          : null;
    if (failure) return { ...initialStepState(step), feedback: failure };
    const reply = defenderReply(chess);
    return { ...state, fen: chess.fen(), feedback: null, lastMove: reply, moves };
  }

  // mate
  if (!chess.isCheckmate()) {
    return {
      ...state,
      feedback: chess.isStalemate()
        ? 'Afogou! O rei não está em xeque e não tem lance: isso é empate. Tente de novo.'
        : chess.isCheck()
          ? 'É xeque, mas o rei ainda consegue escapar. Tente de novo.'
          : 'Ainda não é xeque-mate. Tente de novo.',
    };
  }
  return { ...state, fen: chess.fen(), feedback: null, lastMove, moves, status: 'done' };
}
