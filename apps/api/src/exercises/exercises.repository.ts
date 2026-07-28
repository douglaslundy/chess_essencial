import { ChessJsRules } from '@xadrez/chess-domain';
import type {
  EvaluateExerciseLineInput,
  ExerciseSearchQuery,
  ExerciseTrainingFilters,
  SubmitExerciseAttemptInput,
} from '@xadrez/contracts';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { gradePlayedMoves } from './exercise-grader.js';

type ExerciseRow = {
  answer_format: 'free_text' | 'move_sequence';
  category: string | null;
  chapter_number: number | null;
  difficulty: string | null;
  fen: string | null;
  hints_available: number;
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
    hintsAvailable: row.hints_available,
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

// Only used for 'move_sequence' exercises; 'free_text' answers are graded by
// the learner's own self-assessment (see attempt() below), since exact
// string matching against open-ended prose is unwinnable.
function answerIsCorrect(exercise: AttemptExerciseRow, submittedLine: string[]) {
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
  constructor(
    private readonly database: DatabaseService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

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
      theme: query.theme ?? null,
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
           WHEN 'classic' THEN 'classico' = ANY(e.tags) AND NOT ('lichess' = ANY(e.tags))
           WHEN 'lichess' THEN 'lichess' = ANY(e.tags)
           WHEN 'book' THEN NOT ('classico' = ANY(e.tags)) AND NOT ('challenge' = ANY(e.tags))
           ELSE true END)
         AND (${filter.q}::text IS NOT NULL OR NOT ('challenge' = ANY(e.tags)))
         AND (${filter.theme}::text IS NULL OR ${filter.theme} = ANY(e.tags))
         AND (${filter.lessonId}::uuid IS NULL OR EXISTS (
           SELECT 1 FROM lesson_exercises le WHERE le.exercise_id = e.id AND le.lesson_id = ${filter.lessonId}
         ))
    `;
    const rows = await sql<ExerciseRow[]>`
      SELECT e.id, e.source_number, e.module_number, e.chapter_number, e.title, e.prompt_md,
        COALESCE(e.import_metadata->>'answerFormat', 'move_sequence') AS answer_format, e.difficulty, e.category, e.fen, e.side_to_move, e.tags, e.position_type,
        jsonb_array_length(e.hints) AS hints_available,
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
           WHEN 'classic' THEN 'classico' = ANY(e.tags) AND NOT ('lichess' = ANY(e.tags))
           WHEN 'lichess' THEN 'lichess' = ANY(e.tags)
           WHEN 'book' THEN NOT ('classico' = ANY(e.tags)) AND NOT ('challenge' = ANY(e.tags))
           ELSE true END)
         AND (${filter.q}::text IS NOT NULL OR NOT ('challenge' = ANY(e.tags)))
         AND (${filter.theme}::text IS NULL OR ${filter.theme} = ANY(e.tags))
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

  // Themes are catalogued tags (e.g. "garfo", "mate_em_dois") shared by both
  // the hand-curated and the Lichess-imported challenge exercises; structural
  // tags that only describe provenance, not tactical content, are excluded.
  async listChallengeThemes(userId: string) {
    const sql = this.database.client;
    const rows = await sql<{ count: number; tag: string }[]>`
      SELECT tag, count(*)::integer AS count
        FROM exercises e, unnest(e.tags) AS tag
       WHERE e.status = 'published' AND 'challenge' = ANY(e.tags)
         AND tag NOT IN ('challenge', 'lichess', 'classico')
         AND NOT EXISTS (
           SELECT 1 FROM exercise_attempts a
            WHERE a.exercise_id = e.id AND a.user_id = ${userId} AND a.correct = true
         )
       GROUP BY tag
       ORDER BY count DESC, tag
    `;
    return rows.map((row) => ({ count: row.count, theme: row.tag }));
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
                 WHEN 'classic' THEN 'classico' = ANY(e.tags) AND NOT ('lichess' = ANY(e.tags))
                 WHEN 'lichess' THEN 'lichess' = ANY(e.tags)
                 WHEN 'book' THEN NOT ('classico' = ANY(e.tags)) AND NOT ('challenge' = ANY(e.tags))
                 ELSE true END)
               AND (${filter.q}::text IS NOT NULL OR NOT ('challenge' = ANY(e.tags)))
         AND (${filter.theme}::text IS NULL OR ${filter.theme} = ANY(e.tags))
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
    if (!session) throw new NotFoundException('Sessão de treino não encontrada');
    const [current] = await sql<ExerciseRow[]>`
      SELECT e.id, e.source_number, e.module_number, e.chapter_number, e.title, e.prompt_md,
        COALESCE(e.import_metadata->>'answerFormat', 'move_sequence') AS answer_format, e.difficulty, e.category, e.fen, e.side_to_move, e.tags, e.position_type,
        jsonb_array_length(e.hints) AS hints_available,
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

  /**
   * A 1-item training session pointing at a single, already-chosen exercise
   * — used by the Jornada de Aprendizagem so its stage runner can reuse
   * evaluate-line()'s move-by-move grading (which requires a real session)
   * without duplicating that logic outside this module.
   */
  async createSingleItemSession(userId: string, exerciseId: string): Promise<string> {
    const sql = this.database.client;
    const [session] = await sql<{ id: string }[]>`
      INSERT INTO exercise_training_sessions (user_id, filters)
      VALUES (${userId}, '{}'::jsonb)
      RETURNING id
    `;
    await sql`
      INSERT INTO exercise_training_items (session_id, exercise_id, position)
      VALUES (${session!.id}, ${exerciseId}, 1)
    `;
    return session!.id;
  }

  /** Real server-tracked hint count for a single-item session — used by the Jornada de Aprendizagem stage runner to report hintsUsed truthfully instead of trusting the client. */
  async getSessionHintsUsed(sessionId: string): Promise<number> {
    const sql = this.database.client;
    const [row] = await sql<{ hintsUsed: number }[]>`
      SELECT hints_used AS "hintsUsed" FROM exercise_training_items WHERE session_id = ${sessionId}
    `;
    return row?.hintsUsed ?? 0;
  }

  /** Single playable exercise by id, no session context — used by the Jornada de Aprendizagem stage runner. */
  async getById(exerciseId: string) {
    const sql = this.database.client;
    const [row] = await sql<ExerciseRow[]>`
      SELECT e.id, e.source_number, e.module_number, e.chapter_number, e.title, e.prompt_md,
        COALESCE(e.import_metadata->>'answerFormat', 'move_sequence') AS answer_format, e.difficulty, e.category, e.fen, e.side_to_move, e.tags, e.position_type,
        jsonb_array_length(e.hints) AS hints_available,
        CASE WHEN e.source_pages IS NULL THEN '{}'::integer[]
          ELSE ARRAY(SELECT generate_series(lower(e.source_pages), upper(e.source_pages) - 1)) END AS source_pages
        FROM exercises e
       WHERE e.id = ${exerciseId} AND e.status = 'published'
    `;
    if (!row) throw new NotFoundException('Exercício não encontrado.');
    return summary(row);
  }

  async studyContext(exerciseId: string) {
    const sql = this.database.client;
    const [exercise] = await sql<
      {
        chapter_number: number | null;
        source_pages: number[];
      }[]
    >`
      SELECT e.chapter_number,
        CASE WHEN e.source_pages IS NULL THEN '{}'::integer[]
          ELSE ARRAY(SELECT generate_series(lower(e.source_pages), upper(e.source_pages) - 1)) END AS source_pages
        FROM exercises e WHERE e.id = ${exerciseId} AND e.status = 'published'
    `;
    if (!exercise) throw new NotFoundException('Exercício não encontrado');

    // The linked lesson (lowest position) that teaches this exercise supplies
    // the verified study text; its non-quiz steps are the teaching material and
    // its page range is what the student "flips through" up to the question.
    const [lesson] = await sql<
      { id: string; module_title: string | null; source_pages: number[]; title: string }[]
    >`
      SELECT l.id, l.title, m.title AS module_title,
        CASE WHEN l.source_pages IS NULL THEN '{}'::integer[]
          ELSE ARRAY(SELECT generate_series(lower(l.source_pages), upper(l.source_pages) - 1)) END AS source_pages
        FROM lesson_exercises le
        JOIN lessons l ON l.id = le.lesson_id AND l.status = 'published'
        JOIN course_modules m ON m.id = l.module_id
       WHERE le.exercise_id = ${exerciseId}
       ORDER BY l.position, le.position
       LIMIT 1
    `;

    // 'quiz' and 'board_instruction' steps expect an interactive answer/move;
    // this panel is read-only prose shown before the question, so only the
    // passive teaching steps belong here.
    const teaching = lesson
      ? await sql<{ body_md: string; title: string | null }[]>`
          SELECT s.title, s.body_md
            FROM lesson_steps s
           WHERE s.lesson_id = ${lesson.id} AND s.step_type NOT IN ('quiz', 'board_instruction')
           ORDER BY s.position
        `
      : [];

    return {
      chapterNumber: exercise.chapter_number,
      lessonTitle: lesson?.title ?? null,
      moduleTitle: lesson?.module_title ?? null,
      sourcePages:
        lesson && lesson.source_pages.length > 0 ? lesson.source_pages : exercise.source_pages,
      teaching: teaching.map((step) => ({ bodyMd: step.body_md, title: step.title })),
    };
  }

  async hint(userId: string, sessionId: string) {
    const entitlement = await this.subscriptions.checkEntitlement(userId, 'hints_per_day');
    if (!entitlement.allowed)
      throw new ForbiddenException(
        'Você atingiu o limite diário de dicas do seu plano. Volte amanhã ou assine um plano com mais acesso.',
      );
    const sql = this.database.client;
    const [row] = await sql<{ hints: string[]; hints_used: number }[]>`
      UPDATE exercise_training_items i SET hints_used = i.hints_used + 1
        FROM exercise_training_sessions s, exercises e
       WHERE i.session_id = ${sessionId} AND s.id = i.session_id AND s.user_id = ${userId}
         AND s.status = 'started' AND i.position = s.current_position AND e.id = i.exercise_id
         AND i.hints_used < jsonb_array_length(e.hints)
       RETURNING e.hints, i.hints_used
    `;
    if (!row) throw new NotFoundException('Nenhuma dica disponível para o exercício atual');
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
    if (!row) throw new NotFoundException('Exercício atual não encontrado');
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
    if (!exercise) throw new NotFoundException('Exercício não encontrado');
    const entitlement = await this.subscriptions.checkEntitlement(userId, 'exercises_per_day');
    if (!entitlement.allowed)
      throw new ForbiddenException(
        'Você atingiu o limite diário de exercícios do seu plano. Volte amanhã ou assine um plano com mais acesso.',
      );
    // Free-text answers are open-ended prose ("explique em uma frase...");
    // exact string matching against the book's model answer is essentially
    // unwinnable, so the learner compares their own answer against the
    // revealed solution and reports the verdict themselves.
    if (exercise.answer_format === 'free_text' && input.selfAssessedCorrect === undefined) {
      throw new BadRequestException(
        'Autoavaliação obrigatória para exercícios de texto livre: revele a solução antes de responder',
      );
    }
    const correct =
      exercise.answer_format === 'free_text'
        ? input.selfAssessedCorrect!
        : answerIsCorrect(exercise, input.submittedLine);

    if (input.lessonAttemptId) {
      const [lessonAttempt] = await sql`
        SELECT 1 FROM lesson_attempts la
        JOIN lesson_exercises le ON le.lesson_id = la.lesson_id AND le.exercise_id = ${exerciseId}
        WHERE la.id = ${input.lessonAttemptId} AND la.user_id = ${userId}
      `;
      if (!lessonAttempt)
        throw new BadRequestException('Exercício não está vinculado a esta tentativa de aula');
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
        if (!item) throw new BadRequestException('Exercício não é o atual nesta sessão de treino');
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
    if (!exercise) throw new NotFoundException('Exercício não é o atual nesta sessão de treino');

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
