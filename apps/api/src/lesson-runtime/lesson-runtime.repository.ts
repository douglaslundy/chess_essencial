import { ChessJsRules, IllegalMoveError } from '@xadrez/chess-domain';
import {
  interactiveLessonSchema,
  type InteractiveLesson,
  type LessonActionInput,
  type LessonOverview,
  type LessonAttemptView,
  type PublicLessonStep,
} from '@xadrez/contracts';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { TransactionSql } from 'postgres';

import { DatabaseService } from '../database/database.service.js';

interface AttemptRow {
  contentSnapshot: unknown;
  currentStepKey: string | null;
  id: string;
  lessonId: string;
  lessonVersion: number;
  score: string | number | null;
  state: unknown;
  status: 'started' | 'completed' | 'abandoned';
  updatedAt: Date | string;
  userId: string;
}
interface RuntimeState {
  completedSteps: number;
  correct: number;
  evaluated: number;
  index: number;
  lastFeedback: string | null;
}
interface StepRow {
  bodyMd: string;
  expectedActions: Array<Record<string, unknown>>;
  feedback: Record<string, unknown>;
  initialFen: string | null;
  nextStepRules: Array<Record<string, unknown>>;
  orientation: 'white' | 'black' | null;
  stepKey: string;
  stepType: InteractiveLesson['steps'][number]['stepType'];
  title: string | null;
}

@Injectable()
export class LessonRuntimeRepository {
  constructor(private readonly database: DatabaseService) {}

  async lesson(userId: string, lessonId: string): Promise<LessonOverview> {
    await this.assertPrerequisites(userId, lessonId);
    const lesson = await this.snapshot(lessonId);
    const context = await this.courseContext(lessonId);
    const first = lesson.steps[0]!;
    return {
      courseSlug: context.courseSlug,
      estimatedMinutes: lesson.estimatedMinutes,
      firstStep: {
        bodyMd: first.bodyMd,
        initialFen: first.initialFen ?? null,
        orientation: first.orientation ?? null,
        stepKey: first.stepKey,
        stepType: first.stepType,
        title: first.title ?? null,
      },
      lessonId,
      module: lesson.module,
      nextLessonId: context.nextLessonId,
      previousLessonId: context.previousLessonId,
      title: lesson.title,
    };
  }

  async start(userId: string, lessonId: string): Promise<LessonAttemptView> {
    const [existing] = await this.database.client<AttemptRow[]>`
      SELECT id, user_id AS "userId", lesson_id AS "lessonId", current_step_key AS "currentStepKey",
        status, score, state, lesson_version AS "lessonVersion", content_snapshot AS "contentSnapshot",
        updated_at AS "updatedAt"
      FROM lesson_attempts WHERE user_id = ${userId} AND lesson_id = ${lessonId} AND status = 'started'
    `;
    if (existing) return this.view(existing);
    await this.assertPrerequisites(userId, lessonId);
    const snapshot = await this.snapshot(lessonId);
    const [lessonVersion] = await this.database.client<{ version: number }[]>`
      SELECT version FROM lessons WHERE id = ${lessonId}
    `;
    const state: RuntimeState = {
      completedSteps: 0,
      correct: 0,
      evaluated: 0,
      index: 0,
      lastFeedback: null,
    };
    const [attempt] = await this.database.client<AttemptRow[]>`
      INSERT INTO lesson_attempts (user_id, lesson_id, current_step_key, status, state, lesson_version, content_snapshot)
      VALUES (${userId}, ${lessonId}, ${snapshot.steps[0]!.stepKey}, 'started',
        ${JSON.stringify(state)}::text::jsonb, ${lessonVersion!.version}, ${JSON.stringify(snapshot)}::text::jsonb)
      RETURNING id, user_id AS "userId", lesson_id AS "lessonId", current_step_key AS "currentStepKey",
        status, score, state, lesson_version AS "lessonVersion", content_snapshot AS "contentSnapshot",
        updated_at AS "updatedAt"
    `;
    return this.view(attempt!);
  }

  async get(userId: string, attemptId: string) {
    const attempt = await this.findAttempt(this.database.client, userId, attemptId, false);
    return this.view(attempt);
  }

  async act(userId: string, attemptId: string, action: LessonActionInput) {
    return this.database.client.begin(async (tx) => {
      const attempt = await this.findAttempt(tx, userId, attemptId, true);
      if (attempt.status !== 'started') throw new BadRequestException('Tentativa já encerrada');
      const lesson = interactiveLessonSchema.parse(this.jsonValue(attempt.contentSnapshot));
      const state = this.runtimeState(attempt.state);
      const step = lesson.steps[state.index];
      if (!step) throw new BadRequestException('Etapa atual inválida');

      const outcome = this.evaluate(step, action);
      const feedback = this.feedback(step.feedback, outcome);
      const nextIndex = this.nextIndex(lesson, state.index, outcome);
      const evaluated = state.evaluated + (outcome === 'continued' ? 0 : 1);
      const correct = state.correct + (outcome === 'correct' ? 1 : 0);
      const advances = outcome !== 'incorrect' || nextIndex !== state.index;
      const completedSteps = state.completedSteps + (advances ? 1 : 0);
      const completed = nextIndex >= lesson.steps.length;
      const score = evaluated ? Math.round((correct / evaluated) * 100) : null;
      const nextState: RuntimeState = {
        completedSteps: Math.min(completedSteps, lesson.steps.length),
        correct,
        evaluated,
        index: completed ? lesson.steps.length : nextIndex,
        lastFeedback: feedback,
      };
      const [sequence] = await tx<{ next: number }[]>`
        SELECT coalesce(max(sequence), 0)::integer + 1 AS next
        FROM lesson_attempt_actions WHERE attempt_id = ${attempt.id}
      `;
      await tx`
        INSERT INTO lesson_attempt_actions (attempt_id, sequence, step_key, action, outcome, state_after)
        VALUES (${attempt.id}, ${sequence!.next}, ${step.stepKey},
          ${JSON.stringify(action)}::text::jsonb, ${outcome}, ${JSON.stringify(nextState)}::text::jsonb)
      `;
      const [updated] = await tx<AttemptRow[]>`
        UPDATE lesson_attempts SET current_step_key = ${completed ? null : lesson.steps[nextIndex]!.stepKey},
          status = ${completed ? 'completed' : 'started'}, score = ${score},
          state = ${JSON.stringify(nextState)}::text::jsonb, updated_at = now(),
          completed_at = CASE WHEN ${completed} THEN now() ELSE NULL END
        WHERE id = ${attempt.id}
        RETURNING id, user_id AS "userId", lesson_id AS "lessonId", current_step_key AS "currentStepKey",
          status, score, state, lesson_version AS "lessonVersion", content_snapshot AS "contentSnapshot",
          updated_at AS "updatedAt"
      `;
      if (completed) await this.updateEnrollment(tx, userId, attempt.lessonId);
      return this.view(updated!);
    });
  }

  private evaluate(step: InteractiveLesson['steps'][number], action: LessonActionInput) {
    if (action.type === 'continue') {
      if (!['text', 'explanation', 'summary'].includes(step.stepType))
        throw new BadRequestException('Esta etapa exige uma resposta');
      return 'continued' as const;
    }
    if (action.type === 'move') {
      if (step.stepType !== 'board_instruction' && step.stepType !== 'checkpoint')
        throw new BadRequestException('Esta etapa não aceita jogada');
      try {
        new ChessJsRules(step.initialFen ?? 'startpos').applyMove(action.uci);
      } catch (error) {
        if (error instanceof IllegalMoveError) return 'incorrect' as const;
        throw error;
      }
      return step.expectedActions.some(
        (expected) => expected.type === 'move' && expected.uci === action.uci,
      )
        ? ('correct' as const)
        : ('incorrect' as const);
    }
    if (step.stepType !== 'quiz' && step.stepType !== 'checkpoint')
      throw new BadRequestException('Esta etapa não aceita resposta');
    return step.expectedActions.some(
      (expected) => expected.type === 'answer' && expected.value === action.value,
    )
      ? ('correct' as const)
      : ('incorrect' as const);
  }

  private nextIndex(
    lesson: InteractiveLesson,
    current: number,
    outcome: 'correct' | 'incorrect' | 'continued',
  ) {
    const step = lesson.steps[current]!;
    const rule = step.nextStepRules.find((candidate) => candidate.when === outcome);
    if (typeof rule?.goTo === 'string') {
      const target = lesson.steps.findIndex((candidate) => candidate.stepKey === rule.goTo);
      if (target < 0) throw new BadRequestException('Regra aponta para etapa inexistente');
      return target;
    }
    return outcome === 'incorrect' ? current : current + 1;
  }

  private feedback(
    values: Record<string, unknown>,
    outcome: 'correct' | 'incorrect' | 'continued',
  ) {
    const value = values[outcome];
    return typeof value === 'string' ? value : null;
  }

  private async snapshot(lessonId: string): Promise<InteractiveLesson> {
    const [lesson] = await this.database.client<
      {
        estimatedMinutes: number;
        module: number;
        slug: string;
        title: string;
        version: number;
      }[]
    >`
      SELECT lessons.slug::text AS slug, lessons.title, lessons.estimated_minutes AS "estimatedMinutes",
        lessons.version, course_modules.source_volume::integer AS module
      FROM lessons JOIN course_modules ON course_modules.id = lessons.module_id
      JOIN courses ON courses.id = course_modules.course_id
      WHERE lessons.id = ${lessonId} AND lessons.status = 'published'
    `;
    if (!lesson) throw new NotFoundException('Aula publicada não encontrada');
    const steps = await this.database.client<StepRow[]>`
      SELECT step_key AS "stepKey", step_type AS "stepType", title, body_md AS "bodyMd",
        initial_fen AS "initialFen", orientation, expected_actions AS "expectedActions",
        feedback, next_step_rules AS "nextStepRules"
      FROM lesson_steps WHERE lesson_id = ${lessonId} ORDER BY position
    `;
    const pages = await this.database.client<{ page: number }[]>`
      SELECT page FROM lesson_source_pages WHERE lesson_id = ${lessonId} ORDER BY page
    `;
    const prerequisites = await this.database.client<{ slug: string }[]>`
      SELECT lessons.slug::text AS slug FROM lesson_prerequisites
      JOIN lessons ON lessons.id = lesson_prerequisites.prerequisite_lesson_id
      WHERE lesson_prerequisites.lesson_id = ${lessonId}
    `;
    return interactiveLessonSchema.parse({
      estimatedMinutes: lesson.estimatedMinutes,
      module: lesson.module,
      prerequisites: prerequisites.map((item) => item.slug),
      slug: lesson.slug,
      sourcePages: pages.map((item) => item.page),
      steps: steps.map((step) => ({
        ...step,
        expectedActions: this.jsonValue(step.expectedActions),
        feedback: this.jsonValue(step.feedback),
        nextStepRules: this.jsonValue(step.nextStepRules),
        orientation: step.orientation ?? undefined,
        title: step.title ?? undefined,
      })),
      title: lesson.title,
    });
  }

  private async courseContext(
    lessonId: string,
  ): Promise<{ courseSlug: string; nextLessonId: string | null; previousLessonId: string | null }> {
    const [course] = await this.database.client<{ courseId: string; courseSlug: string }[]>`
      SELECT course_modules.course_id AS "courseId", courses.slug::text AS "courseSlug"
      FROM lessons
      JOIN course_modules ON course_modules.id = lessons.module_id
      JOIN courses ON courses.id = course_modules.course_id
      WHERE lessons.id = ${lessonId}
    `;
    if (!course) throw new NotFoundException('Aula publicada não encontrada');
    const [neighbors] = await this.database.client<
      { nextId: string | null; previousId: string | null }[]
    >`
      WITH ordered AS (
        SELECT lessons.id,
               row_number() OVER (ORDER BY course_modules.position, lessons.position) AS rn
        FROM lessons
        JOIN course_modules ON course_modules.id = lessons.module_id
        WHERE course_modules.course_id = ${course.courseId} AND lessons.status = 'published'
      )
      SELECT next_lesson.id AS "nextId", previous_lesson.id AS "previousId"
      FROM ordered current_lesson
      LEFT JOIN ordered next_lesson ON next_lesson.rn = current_lesson.rn + 1
      LEFT JOIN ordered previous_lesson ON previous_lesson.rn = current_lesson.rn - 1
      WHERE current_lesson.id = ${lessonId}
    `;
    return {
      courseSlug: course.courseSlug,
      nextLessonId: neighbors?.nextId ?? null,
      previousLessonId: neighbors?.previousId ?? null,
    };
  }

  private async assertPrerequisites(userId: string, lessonId: string) {
    const [missing] = await this.database.client<{ count: number }[]>`
      SELECT count(*)::integer AS count FROM lesson_prerequisites
      WHERE lesson_id = ${lessonId} AND NOT EXISTS (
        SELECT 1 FROM lesson_attempts WHERE user_id = ${userId}
          AND lesson_id = lesson_prerequisites.prerequisite_lesson_id AND status = 'completed'
      )
    `;
    if ((missing?.count ?? 0) > 0)
      throw new ForbiddenException('Conclua os pré-requisitos da aula');
  }

  private async findAttempt(
    query: typeof this.database.client | TransactionSql<Record<string, never>>,
    userId: string,
    attemptId: string,
    lock: boolean,
  ) {
    const rows = await query<AttemptRow[]>`
      SELECT id, user_id AS "userId", lesson_id AS "lessonId", current_step_key AS "currentStepKey",
        status, score, state, lesson_version AS "lessonVersion", content_snapshot AS "contentSnapshot",
        updated_at AS "updatedAt"
      FROM lesson_attempts WHERE id = ${attemptId} AND user_id = ${userId}
      ${lock ? query.unsafe('FOR UPDATE') : query.unsafe('')}
    `;
    if (!rows[0]) throw new NotFoundException('Tentativa não encontrada');
    return rows[0];
  }

  private view(attempt: AttemptRow): LessonAttemptView {
    const lesson = interactiveLessonSchema.parse(this.jsonValue(attempt.contentSnapshot));
    const state = this.runtimeState(attempt.state);
    const step = attempt.status === 'started' ? lesson.steps[state.index] : undefined;
    const currentStep: PublicLessonStep | null = step
      ? {
          bodyMd: step.bodyMd,
          initialFen: step.initialFen ?? null,
          orientation: step.orientation ?? null,
          stepKey: step.stepKey,
          stepType: step.stepType,
          title: step.title ?? null,
        }
      : null;
    return {
      attemptId: attempt.id,
      currentStep,
      feedback: state.lastFeedback,
      lessonId: attempt.lessonId,
      progress: { completedSteps: state.completedSteps, totalSteps: lesson.steps.length },
      score: attempt.score === null ? null : Number(attempt.score),
      status: attempt.status,
      updatedAt: new Date(attempt.updatedAt).toISOString(),
    };
  }

  private jsonValue<T>(value: unknown): T {
    return (typeof value === 'string' ? JSON.parse(value) : value) as T;
  }

  private runtimeState(value: unknown): RuntimeState {
    return this.jsonValue<RuntimeState>(value);
  }

  private async updateEnrollment(
    tx: TransactionSql<Record<string, never>>,
    userId: string,
    lessonId: string,
  ) {
    await tx`
      INSERT INTO user_course_enrollments (user_id, course_id, last_lesson_id, progress_percent)
      SELECT ${userId}, course_modules.course_id, ${lessonId},
        (SELECT count(DISTINCT completed.lesson_id)::numeric * 100 /
          greatest(count(DISTINCT published.id), 1)
         FROM lessons published
         JOIN course_modules all_modules ON all_modules.id = published.module_id
         LEFT JOIN lesson_attempts completed ON completed.lesson_id = published.id
           AND completed.user_id = ${userId} AND completed.status = 'completed'
         WHERE all_modules.course_id = course_modules.course_id AND published.status = 'published')
      FROM lessons JOIN course_modules ON course_modules.id = lessons.module_id
      WHERE lessons.id = ${lessonId}
      ON CONFLICT (user_id, course_id) DO UPDATE SET
        last_lesson_id = EXCLUDED.last_lesson_id, progress_percent = EXCLUDED.progress_percent,
        completed_at = CASE WHEN EXCLUDED.progress_percent >= 100 THEN now() ELSE NULL END
    `;
  }
}
