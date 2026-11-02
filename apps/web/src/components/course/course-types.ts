/** Content model of the course "do zero" (docs/CURSO_DO_ZERO.md). Positions are always white to move. */
export type CourseStep =
  /** Coach explanation only; `show` draws a piece path on the board. */
  | { kind: 'info'; say: string; fen?: string; show?: { from: string; to: string } }
  /** Land on every star; the side to move never changes, so the student keeps moving. */
  | { kind: 'stars'; say: string; fen: string; stars: string[]; maxMoves?: number }
  /** One accepted move (UCI); `reply` is the opponent answer played right after it. */
  | { kind: 'move'; say: string; fen: string; accept: string[]; reply?: string }
  /** Checkmate in one move. */
  | { kind: 'mate'; say: string; fen: string }
  /** Checkmate within `maxMoves` against the course defender (course-step.ts). */
  | { kind: 'checkmate'; say: string; fen: string; maxMoves: number }
  /** `count` Lichess puzzles from the bank by tag (`theme`), graded by the server. */
  | { kind: 'puzzle'; say: string; theme: string; difficulty?: string; count: number };

export interface CourseActivity {
  id: string;
  title: string;
  steps: CourseStep[];
}

export interface CourseModule {
  id: string;
  level: 0 | 1 | 2 | 3 | 4;
  title: string;
  activities: CourseActivity[];
}
