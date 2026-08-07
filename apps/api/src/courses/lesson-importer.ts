import { createHash } from 'node:crypto';

import { ChessJsRules } from '@xadrez/chess-domain';
import { interactiveLessonSchema, type InteractiveLesson } from '@xadrez/contracts';
import type { Sql } from 'postgres';

export type LessonDatasetItem = {
  chapter: number;
  exerciseNumbers: number[];
  lesson: InteractiveLesson;
};

export type NormalizedLessonDataset = {
  fileSha256: string;
  items: LessonDatasetItem[];
  sourceName: string;
  sourcePdfSha256: string;
  statistics: {
    boardLessons: number;
    exerciseLinks: number;
    lessonCount: number;
    moduleCount: number;
    stepCount: number;
  };
};

export type LessonImportReport = NormalizedLessonDataset['statistics'] & {
  changed: number;
  importRunId: string | null;
  published: boolean;
  sourceName: string;
  unchanged: number;
};

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Lesson dataset must be an object');
  return value as JsonObject;
}

function integer(value: unknown, label: string) {
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer`);
  return value as number;
}

function string(value: unknown, label: string) {
  if (typeof value !== 'string' || !value) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function validateInteractiveSteps(lesson: InteractiveLesson) {
  for (const step of lesson.steps) {
    if (step.expectedActions.length > 0 && !step.initialFen)
      throw new Error(`${lesson.slug}/${step.stepKey}: every response activity requires a board`);
    if (step.stepType !== 'board_instruction') continue;
    if (!step.initialFen) throw new Error(`${lesson.slug}/${step.stepKey} requires initialFen`);
    for (const action of step.expectedActions) {
      if (action.type !== 'move' || typeof action.uci !== 'string')
        throw new Error(`${lesson.slug}/${step.stepKey} requires expected UCI moves`);
      new ChessJsRules(step.initialFen).applyMove(action.uci);
    }
  }
}

export function normalizeLessonDataset(raw: unknown, sourceName: string): NormalizedLessonDataset {
  const root = object(raw);
  if (root.schemaVersion !== '1.0.0') throw new Error('Unsupported lesson dataset schemaVersion');
  const source = object(root.source);
  const sourcePdfSha256 = string(source.sha256, 'source.sha256').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sourcePdfSha256)) throw new Error('source.sha256 must be SHA-256');
  if (!Array.isArray(root.lessons) || root.lessons.length === 0)
    throw new Error('lessons must not be empty');

  const items: LessonDatasetItem[] = [];
  const slugs = new Set<string>();
  const moduleChapters = new Set<string>();
  const exerciseNumbers = new Set<number>();
  for (const [index, rawItem] of root.lessons.entries()) {
    const item = object(rawItem);
    const chapter = integer(item.chapter, `lessons[${index}].chapter`);
    if (chapter < 1) throw new Error(`lessons[${index}].chapter must be positive`);
    if (
      !Array.isArray(item.exerciseNumbers) ||
      item.exerciseNumbers.length < 2 ||
      item.exerciseNumbers.length > 12
    )
      throw new Error(`lessons[${index}].exerciseNumbers must contain 2-12 values`);
    const numbers = item.exerciseNumbers.map((value, exerciseIndex) =>
      integer(value, `lessons[${index}].exerciseNumbers[${exerciseIndex}]`),
    );
    const parsed = interactiveLessonSchema.safeParse(item.lesson);
    if (!parsed.success) throw new Error(`lessons[${index}] is invalid: ${parsed.error.message}`);
    const lesson = parsed.data;
    if (lesson.steps.length < 3 || lesson.steps.length > 10)
      throw new Error(`${lesson.slug} must contain 3-10 steps`);
    if (!lesson.steps.some((step) => step.stepType === 'summary'))
      throw new Error(`${lesson.slug} requires a summary`);
    if (slugs.has(lesson.slug)) throw new Error(`Duplicate lesson slug ${lesson.slug}`);
    slugs.add(lesson.slug);
    const moduleChapter = `${lesson.module}:${chapter}`;
    if (moduleChapters.has(moduleChapter))
      throw new Error(`Duplicate module/chapter ${moduleChapter}`);
    moduleChapters.add(moduleChapter);
    for (const number of numbers) {
      if (number < 1 || exerciseNumbers.has(number))
        throw new Error(`Duplicate or invalid exercise number ${number}`);
      exerciseNumbers.add(number);
    }
    validateInteractiveSteps(lesson);
    items.push({ chapter, exerciseNumbers: numbers, lesson });
  }
  for (const item of items) {
    for (const prerequisite of item.lesson.prerequisites)
      if (!slugs.has(prerequisite))
        throw new Error(`${item.lesson.slug} has unknown prerequisite ${prerequisite}`);
  }

  const statistics = {
    boardLessons: items.filter((item) =>
      item.lesson.steps.some((step) => step.stepType === 'board_instruction'),
    ).length,
    exerciseLinks: items.reduce((total, item) => total + item.exerciseNumbers.length, 0),
    lessonCount: items.length,
    moduleCount: new Set(items.map((item) => item.lesson.module)).size,
    stepCount: items.reduce((total, item) => total + item.lesson.steps.length, 0),
  };
  const declared = object(root.statistics);
  for (const [key, value] of Object.entries(statistics))
    if (declared[key] !== value) throw new Error(`statistics.${key} must equal ${value}`);
  return {
    fileSha256: createHash('sha256').update(JSON.stringify(raw)).digest('hex'),
    items,
    sourceName,
    sourcePdfSha256,
    statistics,
  };
}

export async function persistLessonDataset(
  sql: Sql,
  dataset: NormalizedLessonDataset,
  options: { courseSlug?: string; linkExercises?: boolean; publish?: boolean } = {},
): Promise<LessonImportReport> {
  const courseSlug = options.courseSlug ?? 'xadrez-essencial';
  const publish = options.publish ?? false;
  const linkExercises = options.linkExercises ?? courseSlug === 'xadrez-essencial';
  if (publish && (dataset.statistics.moduleCount !== 10 || dataset.statistics.lessonCount !== 119))
    throw new Error('Publishing requires the canonical 10 modules and 119 lessons');
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`lesson_content_import:${courseSlug}`}))`;
    const [course] = await tx<
      { id: string }[]
    >`SELECT id FROM courses WHERE slug = ${courseSlug} FOR UPDATE`;
    if (!course) throw new Error(`Course not found: ${courseSlug}`);
    const modules = await tx<{ id: string; sourceVolume: number }[]>`
      SELECT id, source_volume::integer AS "sourceVolume" FROM course_modules
      WHERE course_id = ${course.id} ORDER BY source_volume FOR UPDATE
    `;
    const moduleIds = new Map(modules.map((module) => [module.sourceVolume, module.id]));
    for (const item of dataset.items)
      if (!moduleIds.has(item.lesson.module))
        throw new Error(`Course is missing module ${item.lesson.module}`);

    const [run] = await tx<{ id: string }[]>`
      INSERT INTO lesson_import_runs (
        source_name, source_sha256, source_pdf_sha256, lesson_count, changed_count,
        unchanged_count, step_count, exercise_link_count, published
      ) VALUES (
        ${dataset.sourceName}, ${dataset.fileSha256}, ${dataset.sourcePdfSha256},
        ${dataset.statistics.lessonCount}, 0, ${dataset.statistics.lessonCount},
        ${dataset.statistics.stepCount}, ${dataset.statistics.exerciseLinks}, ${publish}
      ) RETURNING id
    `;
    if (!run) throw new Error('Lesson import run was not created');

    const ids = new Map<string, string>();
    const changedSlugs = new Set<string>();
    let changed = 0;
    let unchanged = 0;
    for (const item of dataset.items) {
      const moduleId = moduleIds.get(item.lesson.module)!;
      const [existing] = await tx<{ id: string; version: number }[]>`
        SELECT id, version FROM lessons WHERE module_id = ${moduleId} AND position = ${item.chapter} FOR UPDATE
      `;
      const [snapshot] = existing
        ? await tx<{ same: boolean }[]>`
            SELECT content = ${JSON.stringify(item.lesson)}::text::jsonb AS same
            FROM lesson_versions WHERE lesson_id = ${existing.id}
            ORDER BY version DESC LIMIT 1
          `
        : [];
      const contentChanged = !existing || snapshot?.same !== true;
      const version = existing ? existing.version + (contentChanged ? 1 : 0) : 1;
      const firstPage = item.lesson.sourcePages[0]!;
      const lastPage = item.lesson.sourcePages.at(-1)!;
      const sourceRange = `[${firstPage},${lastPage + 1})`;
      let lessonId: string;
      if (existing) {
        [lessonId] = [existing.id];
        await tx`
          UPDATE lessons SET slug = ${item.lesson.slug}, title = ${item.lesson.title},
            summary = ${item.lesson.steps[0]!.bodyMd}, estimated_minutes = ${item.lesson.estimatedMinutes},
            status = ${publish ? 'published' : 'draft'}, source_pages = ${sourceRange}::int4range,
            version = ${version}, import_run_id = ${run.id}
          WHERE id = ${lessonId}
        `;
      } else {
        const [created] = await tx<{ id: string }[]>`
          INSERT INTO lessons (
            module_id, slug, position, title, summary, estimated_minutes, status,
            source_pages, version, import_run_id
          ) VALUES (
            ${moduleId}, ${item.lesson.slug}, ${item.chapter}, ${item.lesson.title},
            ${item.lesson.steps[0]!.bodyMd}, ${item.lesson.estimatedMinutes},
            ${publish ? 'published' : 'draft'}, ${sourceRange}::int4range, ${version}, ${run.id}
          ) RETURNING id
        `;
        if (!created) throw new Error(`Failed to create ${item.lesson.slug}`);
        lessonId = created.id;
      }
      ids.set(item.lesson.slug, lessonId);
      if (!contentChanged) {
        unchanged += 1;
        continue;
      }
      changed += 1;
      changedSlugs.add(item.lesson.slug);
      await tx`DELETE FROM lesson_steps WHERE lesson_id = ${lessonId}`;
      await tx`DELETE FROM lesson_source_pages WHERE lesson_id = ${lessonId}`;
      await tx`DELETE FROM lesson_prerequisites WHERE lesson_id = ${lessonId}`;
      for (const [position, step] of item.lesson.steps.entries())
        await tx`
          INSERT INTO lesson_steps (
            lesson_id, step_key, position, step_type, title, body_md, initial_fen,
            orientation, expected_actions, feedback, next_step_rules
          ) VALUES (
            ${lessonId}, ${step.stepKey}, ${position + 1}, ${step.stepType}, ${step.title ?? null},
            ${step.bodyMd}, ${step.initialFen ?? null}, ${step.orientation ?? null},
            ${JSON.stringify(step.expectedActions)}::text::jsonb,
            ${JSON.stringify(step.feedback)}::text::jsonb,
            ${JSON.stringify(step.nextStepRules)}::text::jsonb
          )
        `;
      for (const page of item.lesson.sourcePages)
        await tx`INSERT INTO lesson_source_pages (lesson_id, page) VALUES (${lessonId}, ${page})`;
      await tx`
        INSERT INTO lesson_versions (lesson_id, version, content, created_by_user_id, import_run_id)
        VALUES (${lessonId}, ${version}, ${JSON.stringify(item.lesson)}::text::jsonb, NULL, ${run.id})
      `;
    }

    for (const item of dataset.items) {
      if (!changedSlugs.has(item.lesson.slug)) continue;
      const lessonId = ids.get(item.lesson.slug)!;
      for (const prerequisiteSlug of item.lesson.prerequisites) {
        const prerequisiteId = ids.get(prerequisiteSlug);
        if (!prerequisiteId) throw new Error(`Missing prerequisite ${prerequisiteSlug}`);
        await tx`
          INSERT INTO lesson_prerequisites (lesson_id, prerequisite_lesson_id)
          VALUES (${lessonId}, ${prerequisiteId})
        `;
      }
    }

    const canonicalIds = tx.array([...ids.values()], 2950);
    await tx`
      UPDATE lessons SET status = 'archived'
      WHERE module_id IN (SELECT id FROM course_modules WHERE course_id = ${course.id})
        AND id <> ALL(${canonicalIds}::uuid[])
    `;
    if (linkExercises) {
      await tx`DELETE FROM lesson_exercises WHERE lesson_id = ANY(${canonicalIds}::uuid[])`;
      for (const item of dataset.items) {
        const lessonId = ids.get(item.lesson.slug)!;
        const rows = await tx<{ id: string; sourceNumber: number }[]>`
          SELECT id, source_number AS "sourceNumber" FROM exercises
          WHERE source_number = ANY(${tx.array(item.exerciseNumbers, 23)}::integer[])
        `;
        const exerciseIds = new Map(rows.map((row) => [row.sourceNumber, row.id]));
        if (exerciseIds.size !== item.exerciseNumbers.length)
          throw new Error(`Missing exercises for ${item.lesson.slug}`);
        for (const [position, sourceNumber] of item.exerciseNumbers.entries())
          await tx`
            INSERT INTO lesson_exercises (lesson_id, exercise_id, position)
            VALUES (${lessonId}, ${exerciseIds.get(sourceNumber)!}, ${position + 1})
          `;
      }
    }
    await tx`
      UPDATE lesson_import_runs SET changed_count = ${changed}, unchanged_count = ${unchanged}
      WHERE id = ${run.id}
    `;
    if (publish) {
      const [ready] = await tx<
        { exerciseLinks: number; invalid: number; lessonCount: number; moduleCount: number }[]
      >`
        SELECT count(DISTINCT cm.id)::integer AS "moduleCount",
          count(DISTINCT l.id)::integer AS "lessonCount",
          (SELECT count(*)::integer FROM lesson_exercises le
            WHERE le.lesson_id = ANY(${canonicalIds}::uuid[])) AS "exerciseLinks",
          count(DISTINCT l.id) FILTER (WHERE NOT EXISTS
            (SELECT 1 FROM lesson_source_pages lsp WHERE lsp.lesson_id = l.id)
            OR NOT EXISTS (SELECT 1 FROM lesson_steps ls WHERE ls.lesson_id = l.id))::integer AS invalid
        FROM course_modules cm JOIN lessons l ON l.module_id = cm.id
        WHERE cm.course_id = ${course.id} AND l.id = ANY(${canonicalIds}::uuid[])
      `;
      if (
        !ready ||
        ready.moduleCount !== dataset.statistics.moduleCount ||
        ready.lessonCount !== dataset.statistics.lessonCount ||
        ready.exerciseLinks !== dataset.statistics.exerciseLinks ||
        ready.invalid > 0
      )
        throw new Error('Course publication gate failed');
      await tx`
        UPDATE courses SET status = 'published', version = version + 1, updated_at = now()
        WHERE id = ${course.id}
      `;
    } else {
      await tx`UPDATE courses SET status = 'draft', updated_at = now() WHERE id = ${course.id}`;
    }
    return {
      ...dataset.statistics,
      changed,
      importRunId: run.id,
      published: publish,
      sourceName: dataset.sourceName,
      unchanged,
    };
  });
}
