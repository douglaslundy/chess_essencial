import { ChessJsRules } from '@xadrez/chess-domain';
import type {
  EvaluateExerciseLineInput,
  ExerciseSearchQuery,
  ExerciseTrainingFilters,
  SubmitExerciseAttemptInput,
} from '@xadrez/contracts';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';
import { gradePlayedMoves } from './exercise-grader.js';

type ExerciseRow = {
  answer_format: 'free_text' | 'move_sequence';
  category: string | null;
  chapter_number: number | null;
  difficulty: string | null;
  fen: string | null;
  id: string;
  module_number: number | null;
  position_type: 'legal_position' | 'illustrative_diagram' | 'text_only';
  prompt_md: string;
  side_to_move: 'white' | 'black' | null;
  source_number: number | null;
  source_pages: number[];
  tags: string[];
  title: string | null;
};

type AttemptExerciseRow = ExerciseRow & {
  hints: string[];
  solution_lines: string[][];
  solution_md: string;
};

function summary(row: ExerciseRow) {
  return {
    answerFormat: row.answer_format,
    category: row.category,
    chapterNumber: row.chapter_number,
    difficulty: row.difficulty,
    fen: row.fen,
    id: row.id,
    moduleNumber: row.module_number,
    positionType: row.position_type,
    promptMd: row.prompt_md,
    sideToMove: row.side_to_move,
    sourceNumber: row.source_number,
    sourcePages: row.source_pages,
    tags: row.tags,
    title: row.title,
  };
}

function normalizedLine(line: string[]) {
  return line.map((move) => move.trim().toLowerCase());
}

function lineIsLegal(exercise: AttemptExerciseRow, line: string[]) {
  if (exercise.position_type !== 'legal_position' || exercise.fen === null) return true;
  try {
    const rules = new ChessJsRules(exercise.fen);
    for (const move of line) rules.applyMove(move);
    return true;
  } catch {
    return false;
  }
}

function answerIsCorrect(exercise: AttemptExerciseRow, submittedLine: string[]) {
  if (exercise.answer_format === 'free_text') {
    const submitted = submittedLine
      .join(' ')
      .normalize('NFKC')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    const expected = exercise.solution_md
      .normalize('NFKC')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    return submitted === expected;
  }
  if (!lineIsLegal(exercise, submittedLine)) return false;
  const submitted = normalizedLine(submittedLine);
  return exercise.solution_lines.some((solution) => {
    const expected = normalizedLine(solution);
    return (
      expected.length === submitted.length &&
      expected.every((move, index) => move === submitted[index])
    );
  });
}

@Injectable()
export class ExercisesRepository {
  constructor(private readonly database: DatabaseService) {}

  private filters(query: ExerciseSearchQuery | ExerciseTrainingFilters) {
    return {
      category: query.category ?? null,
      chapter: query.chapter ?? null,
      difficulty: query.difficulty ?? null,
      lessonId: query.lessonId ?? null,
      module: query.module ?? null,
      positionType: query.positionType ?? null,
      q: query.q ?? null,
      source: query.source ?? null,
    };
  }

  async search(query: ExerciseSearchQuery) {
    const sql = this.database.client;
    const filter = this.filters(query);
    const [count] = await sql<{ total: number }[]>`
      SELECT count(*)::integer AS total FROM exercises e
       WHERE e.status = 'published'
         AND (${filter.category}::text IS NULL OR e.category = ${filter.category})
         AND (${filter.chapter}::integer IS NULL OR e.chapter_number = ${filter.chapter})
         AND (${filter.difficulty}::text IS NULL OR e.difficulty = ${filter.difficulty})
         AND (${filter.module}::integer IS NULL OR e.module_number = ${filter.module})
         AND (${filter.positionType}::text IS NULL OR e.position_type = ${filter.positionType})
         AND (${filter.q}::text IS NULL OR concat_ws(' ', e.title, e.prompt_md, e.category, array_to_string(e.tags, ' ')) ILIKE '%' || ${filter.q} || '%')
         AND (${filter.source}::text IS NULL OR CASE ${filter.source}
           WHEN 'classic' THEN 'classico' = ANY(e.tags)
           WHEN 'book' THEN NOT ('classico' = ANY(e.tags)) AND NOT ('challenge' = ANY(e.tags))
           ELSE true END)
         AND (${filter.q}::text IS NOT NULL OR NOT ('challenge' = ANY(e.tags)))
         AND (${filter.lessonId}::uuid IS NULL OR EXISTS (
           SELECT 1 FROM lesson_exercises le WHERE le.exercise_id = e.id AND le.lesson_id = ${filter.lessonId}
         ))
    `;
    const rows = await sql<ExerciseRow[]>`
      SELECT e.id, e.source_number, e.module_number, e.chapter_number, e.title, e.prompt_md,
        COALESCE(e.import_metadata->>'answerFormat', 'move_sequence') AS answer_format, e.difficulty, e.category, e.fen, e.side_to_move, e.tags, e.position_type,
        CASE WHEN e.source_pages IS NULL THEN '{}'::integer[]
          ELSE ARRAY(SELECT generate_series(lower(e.source_pages), upper(e.source_pages) - 1)) END AS source_pages
        FROM exercises e
       WHERE e.status = 'published'
         AND (${filter.category}::text IS NULL OR e.category = ${filter.category})
         AND (${filter.chapter}::integer IS NULL OR e.chapter_number = ${filter.chapter})
         AND (${filter.difficulty}::text IS NULL OR e.difficulty = ${filter.difficulty})
         AND (${filter.module}::integer IS NULL OR e.module_number = ${filter.module})
         AND (${filter.positionType}::text IS NULL OR e.position_type = ${filter.positionType})
         AND (${filter.q}::text IS NULL OR concat_ws(' ', e.title, e.prompt_md, e.category, array_to_string(e.tags, ' ')) ILIKE '%' || ${filter.q} || '%')
         AND (${filter.source}::text IS NULL OR CASE ${filter.source}
           WHEN 'classic' THEN 'classico' = ANY(e.tags)
           WHEN 'book' THEN NOT ('classico' = ANY(e.tags)) AND NOT ('challenge' = ANY(e.tags))
           ELSE true END)
         AND (${filter.q}::text IS NOT NULL OR NOT ('challenge' = ANY(e.tags)))
         AND (${filter.lessonId}::uuid IS NULL OR EXISTS (
           SELECT 1 FROM lesson_exercises le WHERE le.exercise_id = e.id AND le.lesson_id = ${filter.lessonId}
         ))
       ORDER BY e.source_number NULLS LAST, e.id
       LIMIT ${query.limit} OFFSET ${query.offset}
    `;
    return {
      items: rows.map(summary),
      limit: query.limit,
      offset: query.offset,
      total: count?.total ?? 0,
    };
  }

  async startTraining(userId: string, filters: ExerciseTrainingFilters) {
    const sql = this.database.client;
    const filter = this.filters(filters);
    const sessionId = await sql.begin(async (transaction) => {
      const [session] = await transaction<{ id: string }[]>`
        INSERT INTO exercise_training_sessions (user_id, filters)
        VALUES (${userId}, ${JSON.stringify(filters)}::text::jsonb) RETURNING id
      `;
      if (!session) throw new Error('Training session was not created');
      await transaction`
        INSERT INTO exercise_training_items (session_id, exercise_id, position)
        SELECT ${session.id}, selected.id, row_number() OVER (ORDER BY selected.difficulty_rank, selected.source_number NULLS LAST, selected.id)
          FROM (
            SELECT e.id, e.source_number,
              CASE e.difficulty
                WHEN 'beginner' THEN 1
                WHEN 'intermediate' THEN 2
                WHEN 'advanced' THEN 3
                WHEN 'expert' THEN 4
                ELSE 5
              END AS difficulty_rank
              FROM exercises e
             WHERE e.status = 'published'
               AND (${filter.category}::text IS NULL OR e.category = ${filter.category})
               AND (${filter.chapter}::integer IS NULL OR e.chapter_number = ${filter.chapter})
               AND (${filter.difficulty}::text IS NULL OR e.difficulty = ${filter.difficulty})
               AND (${filter.module}::integer IS NULL OR e.module_number = ${filter.module})
               AND (${filter.positionType}::text IS NULL OR e.position_type = ${filter.positionType})
               AND (${filter.q}::text IS NULL OR concat_ws(' ', e.title, e.prompt_md, e.category, array_to_string(e.tags, ' ')) ILIKE '%' || ${filter.q} || '%')
               AND (${filter.source}::text IS NULL OR CASE ${filter.source}
                 WHEN 'classic' THEN 'classico' = ANY(e.tags)
                 WHEN 'book' THEN NOT ('classico' = ANY(e.tags)) AND NOT ('challenge' = ANY(e.tags))
                 ELSE true END)
               AND (${filter.q}::text IS NOT NULL OR NOT ('challenge' = ANY(e.tags)))
               AND NOT EXISTS (
                 SELECT 1 FROM exercise_attempts a
                  WHERE a.exercise_id = e.id AND a.user_id = ${userId} AND a.correct = true
               )
               AND (${filter.lessonId}::uuid IS NULL OR EXISTS (
                 SELECT 1 FROM lesson_exercises le WHERE le.exercise_id = e.id AND le.lesson_id = ${filter.lessonId}
               ))
             ORDER BY difficulty_rank, e.source_number NULLS LAST, e.id LIMIT ${filters.limit}
          ) selected
      `;
      await transaction`
        UPDATE exercise_training_sessions s SET status = 'completed', completed_at = now()
         WHERE s.id = ${session.id}
           AND NOT EXISTS (SELECT 1 FROM exercise_training_items i WHERE i.session_id = s.id)
      `;
      return session.id;
    });
    return this.training(userId, sessionId);
  }

  async training(userId: string, sessionId: string) {
    const sql = this.database.client;
    const [session] = await sql<
      {
        completed: number;
        current_position: number;
        id: string;
        status: 'started' | 'completed' | 'abandoned';
        total: number;
      }[]
    >`
      SELECT s.id, s.status, s.current_position, count(i.*)::integer AS total,
        count(i.completed_at)::integer AS completed
        FROM exercise_training_sessions s
        LEFT JOIN exercise_training_items i ON i.session_id = s.id
       WHERE s.id = ${sessionId} AND s.user_id = ${userId}
       GROUP BY s.id
    `;
    if (!session) throw new NotFoundException('Training session not found');
    const [current] = await sql<ExerciseRow[]>`
      SELECT e.id, e.source_number, e.module_number, e.chapter_number, e.title, e.prompt_md,
        COALESCE(e.import_metadata->>'answerFormat', 'move_sequence') AS answer_format, e.difficulty, e.category, e.fen, e.side_to_move, e.tags, e.position_type,
        CASE WHEN e.source_pages IS NULL THEN '{}'::integer[]
          ELSE ARRAY(SELECT generate_series(lower(e.source_pages), upper(e.source_pages) - 1)) END AS source_pages
        FROM exercise_training_items i JOIN exercises e ON e.id = i.exercise_id
       WHERE i.session_id = ${sessionId} AND i.position = ${session.current_position}
    `;
    return {
      completed: session.completed,
      currentExercise: current ? summary(current) : null,
      position: session.status === 'completed' ? session.total : session.current_position,
      sessionId: session.id,
      status: session.status,
      total: session.total,
    };
  }

  async hint(userId: string, sessionId: string) {
    const sql = this.database.client;
    const [row] = await sql<{ hints: string[]; hints_used: number }[]>`
      UPDATE exercise_training_items i SET hints_used = i.hints_used + 1
        FROM exercise_training_sessions s, exercises e
       WHERE i.session_id = ${sessionId} AND s.id = i.session_id AND s.user_id = ${userId}
         AND s.status = 'started' AND i.position = s.current_position AND e.id = i.exercise_id
         AND i.hints_used < jsonb_array_length(e.hints)
       RETURNING e.hints, i.hints_used
    `;
    if (!row) throw new NotFoundException('No hint is available for the current exercise');
    return {
      hint: row.hints[row.hints_used - 1]!,
      hintNumber: row.hints_used,
      remaining: row.hints.length - row.hints_used,
    };
  }

  async solution(userId: string, sessionId: string) {
    const sql = this.database.client;
    const [row] = await sql<{ solution_lines: string[][]; solution_md: string }[]>`
      UPDATE exercise_training_items i SET solution_revealed = true
        FROM exercise_training_sessions s, exercises e
       WHERE i.session_id = ${sessionId} AND s.id = i.session_id AND s.user_id = ${userId}
         AND s.status = 'started' AND i.position = s.current_position AND e.id = i.exercise_id
       RETURNING e.solution_lines, e.solution_md
    `;
    if (!row) throw new NotFoundException('Current exercise not found');
    return { solutionLines: row.solution_lines, solutionMd: row.solution_md };
  }

  async attempt(userId: string, exerciseId: string, input: SubmitExerciseAttemptInput) {
    const sql = this.database.client;
    const [exercise] = await sql<AttemptExerciseRow[]>`
      SELECT e.id, e.source_number, e.module_number, e.chapter_number, e.title, e.prompt_md,
        COALESCE(e.import_metadata->>'answerFormat', 'move_sequence') AS answer_format, e.difficulty, e.category, e.fen, e.side_to_move, e.tags, e.position_type,
        e.solution_lines, e.solution_md, e.hints, '{}'::integer[] AS source_pages
        FROM exercises e WHERE e.id = ${exerciseId} AND e.status = 'published'
    `;
    if (!exercise) throw new NotFoundException('Exercise not found');
    const correct = answerIsCorrect(exercise, input.submittedLine);

    if (input.lessonAttemptId) {
      const [lessonAttempt] = await sql`
        SELECT 1 FROM lesson_attempts la
        JOIN lesson_exercises le ON le.lesson_id = la.lesson_id AND le.exercise_id = ${exerciseId}
        WHERE la.id = ${input.lessonAttemptId} AND la.user_id = ${userId}
      `;
      if (!lessonAttempt)
        throw new BadRequestException('Exercise is not linked to this lesson attempt');
    }

    const result = await sql.begin(async (transaction) => {
      let hintsUsed = 0;
      if (input.trainingSessionId && correct) {
        const [item] = await transaction<{ hints_used: number }[]>`
          SELECT i.hints_used FROM exercise_training_items i
          JOIN exercise_training_sessions s ON s.id = i.session_id
          WHERE s.id = ${input.trainingSessionId} AND s.user_id = ${userId}
            AND s.status = 'started' AND i.position = s.current_position AND i.exercise_id = ${exerciseId}
          FOR UPDATE OF s, i
        `;
        if (!item)
          throw new BadRequestException('Exercise is not current in this training session');
        hintsUsed = item.hints_used;
      }
      const score = correct ? Math.max(0, 100 - hintsUsed * 10) : 0;
      const [attempt] = await transaction<{ id: string }[]>`
        INSERT INTO exercise_attempts (
          user_id, exercise_id, lesson_attempt_id, training_session_id, submitted_line,
          correct, score, hints_used, duration_ms
        ) VALUES (
          ${userId}, ${exerciseId}, ${input.lessonAttemptId ?? null}, ${input.trainingSessionId ?? null},
          ${JSON.stringify(input.submittedLine)}::text::jsonb, ${correct}, ${score}, ${hintsUsed}, ${input.durationMs}
        ) RETURNING id
      `;
      if (!attempt) throw new Error('Exercise attempt was not created');
      if (input.trainingSessionId && correct) {
        await transaction`
          UPDATE exercise_training_items SET completed_at = now()
           WHERE session_id = ${input.trainingSessionId} AND exercise_id = ${exerciseId}
        `;
        await transaction`
          UPDATE exercise_training_sessions s
             SET current_position = current_position + 1,
                 status = CASE WHEN current_position >= (SELECT count(*) FROM exercise_training_items WHERE session_id = s.id)
                   THEN 'completed' ELSE status END,
                 completed_at = CASE WHEN current_position >= (SELECT count(*) FROM exercise_training_items WHERE session_id = s.id)
                   THEN now() ELSE completed_at END
           WHERE id = ${input.trainingSessionId}
        `;
      }
      return { attemptId: attempt.id, correct, hintsUsed, score };
    });
    return {
      ...result,
      training: input.trainingSessionId
        ? await this.training(userId, input.trainingSessionId)
        : null,
    };
  }

  async evaluateLine(userId: string, exerciseId: string, input: EvaluateExerciseLineInput) {
    const sql = this.database.client;
    const [exercise] = await sql<{ solution_lines: string[][] }[]>`
      SELECT e.solution_lines
        FROM exercises e
        JOIN exercise_training_items i ON i.exercise_id = e.id
        JOIN exercise_training_sessions s ON s.id = i.session_id
       WHERE e.id = ${exerciseId} AND e.status = 'published'
         AND s.id = ${input.trainingSessionId} AND s.user_id = ${userId}
         AND s.status = 'started' AND i.position = s.current_position
    `;
    if (!exercise) throw new NotFoundException('Exercise is not current in this training session');

    const grade = gradePlayedMoves(exercise.solution_lines, input.playedMoves);

    if (grade.status !== 'solved') {
      return {
        attempt: null,
        movesConfirmed: grade.movesConfirmed,
        opponentReply: grade.opponentReply,
        status: grade.status,
      };
    }

    const fullLine =
      exercise.solution_lines.find((line) => {
        const playerMoves = line
          .filter((_, index) => index % 2 === 0)
          .map((move) => move.trim().toLowerCase());
        const played = input.playedMoves.map((move) => move.trim().toLowerCase());
        return (
          played.length === playerMoves.length &&
          played.every((move, index) => move === playerMoves[index])
        );
      }) ?? input.playedMoves;

    const attempt = await this.attempt(userId, exerciseId, {
      durationMs: 0,
      submittedLine: fullLine,
      trainingSessionId: input.trainingSessionId,
    });

    return {
      attempt,
      movesConfirmed: grade.movesConfirmed,
      opponentReply: null,
      status: 'solved' as const,
    };
  }

  async metrics(userId: string) {
    const sql = this.database.client;
    const [row] = await sql<
      {
        accuracy_percent: number;
        attempted: number;
        average_duration_ms: number;
        correct: number;
        hints_used: number;
      }[]
    >`
      SELECT count(*)::integer AS attempted,
        count(*) FILTER (WHERE correct)::integer AS correct,
        COALESCE(round(100.0 * count(*) FILTER (WHERE correct) / NULLIF(count(*), 0), 2), 0)::float AS accuracy_percent,
        COALESCE(round(avg(duration_ms)), 0)::integer AS average_duration_ms,
        COALESCE(sum(hints_used), 0)::integer AS hints_used
        FROM exercise_attempts WHERE user_id = ${userId}
    `;
    return {
      accuracyPercent: row?.accuracy_percent ?? 0,
      attempted: row?.attempted ?? 0,
      averageDurationMs: row?.average_duration_ms ?? 0,
      correct: row?.correct ?? 0,
      hintsUsed: row?.hints_used ?? 0,
    };
  }
}
