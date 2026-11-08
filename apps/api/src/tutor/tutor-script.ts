import { Chess } from 'chess.js';

import { factsFor } from '../library/library-review-prompt.js';

/** One frame the tutor explains: a move of a game/exercise or a step of a course lesson. */
export interface TutorStep {
  index: number;
  label: string;
  /** What the model is shown for this step. */
  line: string;
}

export interface TutorScript {
  /** Facts about the whole content, for the overview. */
  context: string;
  steps: TutorStep[];
  title: string;
}

const PIECES: Record<string, { color: [string, string]; name: string }> = {
  b: { color: ['branco', 'preto'], name: 'Bispo' },
  k: { color: ['branco', 'preto'], name: 'Rei' },
  n: { color: ['branco', 'preto'], name: 'Cavalo' },
  p: { color: ['branco', 'preto'], name: 'Peão' },
  q: { color: ['branca', 'preta'], name: 'Dama' },
  r: { color: ['branca', 'preta'], name: 'Torre' },
};

/** "Peão branco de e2 para e4", "Roque curto das brancas". */
export function moveLabel(move: {
  color: 'b' | 'w';
  from: string;
  piece: string;
  san: string;
  to: string;
}): string {
  const side = move.color === 'w' ? 0 : 1;
  if (move.san.startsWith('O-O-O')) return `Roque grande das ${side ? 'pretas' : 'brancas'}`;
  if (move.san.startsWith('O-O')) return `Roque curto das ${side ? 'pretas' : 'brancas'}`;
  const piece = PIECES[move.piece]!;
  return `${piece.name} ${piece.color[side]} de ${move.from} para ${move.to}`;
}

function uci(token: string) {
  const promotion = token.slice(4, 5);
  return {
    from: token.slice(0, 2),
    to: token.slice(2, 4),
    ...(promotion ? { promotion } : {}),
  };
}

function applyAny(chess: Chess, token: string) {
  try {
    return chess.move(token);
  } catch {
    return chess.move(uci(token));
  }
}

/**
 * Steps for a sequence of moves (SAN or UCI) from `startFen`. `notes[i]` adds what is known about
 * move i (for example the engine's quality verdict). Stops at the first illegal move.
 */
export function movesToSteps(
  startFen: string | null,
  moves: string[],
  notes: Array<string | null> = [],
): TutorStep[] {
  const chess = startFen ? new Chess(startFen) : new Chess();
  const steps: TutorStep[] = [];
  for (const [i, token] of moves.entries()) {
    const fen = chess.fen();
    let move;
    try {
      move = applyAny(chess, token);
    } catch {
      break;
    }
    const who = move.color === 'w' ? 'Brancas' : 'Pretas';
    const label = moveLabel(move);
    const facts = factsFor(fen, move.san);
    const note = notes[i] ? ` | ${notes[i]}` : '';
    steps.push({
      index: i + 1,
      label,
      line: `ply ${i + 1} (${who}) ${move.san} = ${label} | posição antes: ${fen}${facts}${note}`,
    });
  }
  return steps;
}

export function lessonSteps(steps: Array<{ say: string }>): TutorStep[] {
  return steps.map((step, i) => ({
    index: i + 1,
    label: `Passo ${i + 1}`,
    line: `passo ${i + 1}: ${step.say}`,
  }));
}

const QUALITY_PT: Record<string, string> = { imprecisao: 'imprecisão', otimo: 'ótimo' };

/** Per-move note from the engine verdict: quality and, for bad moves, the engine's better move. */
export function reviewNotes(
  moves: string[],
  analyses: Array<{ best_move_uci: string | null; ply: number; quality: string }>,
): Array<string | null> {
  const byPly = new Map(analyses.map((a) => [a.ply, a]));
  const chess = new Chess();
  return moves.map((san, i) => {
    const fen = chess.fen();
    try {
      chess.move(san);
    } catch {
      return null;
    }
    const a = byPly.get(i + 1);
    if (!a) return null;
    const quality = QUALITY_PT[a.quality] ?? a.quality;
    let better = '';
    if (a.best_move_uci && !['otimo', 'excelente', 'bom'].includes(a.quality)) {
      try {
        const best = new Chess(fen).move(uci(a.best_move_uci));
        better = `; o motor preferia ${moveLabel(best)}`;
      } catch {
        // Engine move not legal here: no suggestion.
      }
    }
    return `avaliação do motor: ${quality}${better}`;
  });
}
