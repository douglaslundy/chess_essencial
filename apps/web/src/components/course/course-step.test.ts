import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

import { COURSE_ACTIVITIES, findActivity } from './course-content';
import { applyCourseMove, initialStepState, type StepState } from './course-step';
import type { CourseStep } from './course-types';

const play = (step: CourseStep, ...ucis: string[]) =>
  ucis.reduce<StepState | null>(
    (state, uci) => (state ? applyCourseMove(step, state, uci) : null),
    initialStepState(step),
  );

const ROOK = '7k/8/8/8/3R4/8/8/K7 w - - 0 1';

describe('course steps', () => {
  it('info steps are done from the start', () => {
    expect(initialStepState({ kind: 'info', say: 'Oi' }).status).toBe('done');
  });

  it('stars: keeps the same side to move until every star is taken', () => {
    const step: CourseStep = {
      kind: 'stars',
      say: '',
      fen: ROOK,
      stars: ['d7', 'g7'],
      maxMoves: 2,
    };
    const half = play(step, 'd4d7')!;
    expect(half.status).toBe('playing');
    expect(half.stars).toEqual(['g7']);
    expect(new Chess(half.fen).turn()).toBe('w');
    expect(applyCourseMove(step, half, 'd7g7')!.status).toBe('done');
  });

  it('stars: restarts after too many moves and ignores illegal ones', () => {
    const step: CourseStep = {
      kind: 'stars',
      say: '',
      fen: ROOK,
      stars: ['d7', 'g7'],
      maxMoves: 2,
    };
    expect(play(step, 'd4e5')).toBeNull();
    const reset = play(step, 'd4d5', 'd5d6')!;
    expect(reset.fen).toBe(ROOK);
    expect(reset.stars).toEqual(['d7', 'g7']);
    expect(reset.feedback).toMatch(/Tente de novo/);
  });

  it('move: accepts only the listed move and plays the reply', () => {
    const step: CourseStep = {
      kind: 'move',
      say: '',
      fen: '7k/8/3n4/8/8/8/3R4/K7 w - - 0 1',
      accept: ['d2d6'],
      reply: 'h8g8',
    };
    const wrong = play(step, 'd2d3')!;
    expect(wrong.status).toBe('playing');
    expect(wrong.fen).toBe(step.fen);
    const right = play(step, 'd2d6')!;
    expect(right.status).toBe('done');
    expect(right.lastMove).toEqual({ from: 'h8', to: 'g8' });
  });

  it('mate: done only on checkmate', () => {
    const step: CourseStep = { kind: 'mate', say: '', fen: '7k/5ppp/8/8/8/8/8/R5K1 w - - 0 1' };
    expect(play(step, 'a1a7')!.status).toBe('playing');
    expect(play(step, 'a1a8')!.status).toBe('done');
  });
});

/** Fewest moves for the side to move to land on every star (the side to move never changes). */
function minMovesForStars(fen: string, stars: string[], limit: number): number | null {
  let frontier = [{ fen, left: stars }];
  for (let depth = 1; depth <= limit; depth += 1) {
    const next: typeof frontier = [];
    for (const node of frontier) {
      for (const move of new Chess(node.fen).moves({ verbose: true })) {
        const left = node.left.filter((square) => square !== move.to);
        if (left.length === 0) return depth;
        const after = move.after.split(' ');
        after[1] = node.fen.split(' ')[1]!;
        after[3] = '-';
        next.push({ fen: after.join(' '), left });
      }
    }
    frontier = next;
  }
  return null;
}

describe('course content', () => {
  it('has unique activity ids that the API accepts', () => {
    const ids = COURSE_ACTIVITIES.map((activity) => activity.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]{1,80}$/);
    expect(findActivity(ids[0]!)?.next?.id).toBe(ids[1]);
  });

  it('every step is valid and solvable', () => {
    for (const activity of COURSE_ACTIVITIES) {
      expect(activity.steps.length).toBeGreaterThan(0);
      for (const step of activity.steps) {
        const label = `${activity.id}: ${step.say}`;
        if (step.fen) expect(() => new Chess(step.fen), label).not.toThrow();
        if (step.kind === 'stars') {
          const needed = minMovesForStars(step.fen, step.stars, step.maxMoves ?? 4);
          expect(needed, label).not.toBeNull();
        }
        if (step.kind === 'move') {
          for (const uci of step.accept) expect(play(step, uci)?.status, label).toBe('done');
        }
        if (step.kind === 'mate') {
          const chess = new Chess(step.fen);
          const mates = chess.moves({ verbose: true }).filter((move) => {
            const after = new Chess(move.after);
            return after.isCheckmate();
          });
          expect(mates.length, label).toBeGreaterThan(0);
        }
      }
    }
  });
});
