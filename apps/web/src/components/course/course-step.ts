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
    fen: step.fen ?? START_FEN,
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

/** Applies the student's move. Returns null for an illegal move (the board ignores it). */
export function applyCourseMove(step: CourseStep, state: StepState, uci: string): StepState | null {
  if (step.kind === 'info' || state.status === 'done') return null;
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
