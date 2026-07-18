import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { normalizeLessonDataset, persistLessonDataset } from './lesson-importer.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;
const courseSlug = 'lesson-importer-integration';
const sourceHash = '5c04386a52193fb6f89b969731f307ac30c3ef08dd7ea9ebfec7a400e4c9662b';

function content(module: number, slug: string, title: string, prerequisites: string[] = []) {
  return {
    estimatedMinutes: 8,
    module,
    prerequisites,
    slug,
    sourcePages: [module * 10],
    steps: [
      {
        bodyMd: `Objective for ${title}.`,
        expectedActions: [],
        feedback: {},
        nextStepRules: [],
        stepKey: 'objective',
        stepType: 'text',
      },
      {
        bodyMd: 'Complete the written practice and type done.',
        expectedActions: [{ type: 'answer', value: 'done' }],
        feedback: { correct: 'Correct.', incorrect: 'Try again.' },
        nextStepRules: [],
        stepKey: 'practice',
        stepType: 'quiz',
      },
      {
        bodyMd: `Summary for ${title}.`,
        expectedActions: [],
        feedback: {},
        nextStepRules: [],
        stepKey: 'summary',
        stepType: 'summary',
      },
    ],
    title,
  };
}

function raw(secondTitle = 'Second lesson', secondSlug = 'second-lesson') {
  const lessons = [
    {
      chapter: 1,
      exerciseNumbers: [70001, 70002],
      lesson: content(1, 'first-lesson', 'First lesson'),
    },
    {
      chapter: 1,
      exerciseNumbers: [70003, 70004],
      lesson: content(2, secondSlug, secondTitle, ['first-lesson']),
    },
  ];
  return {
    lessons,
    schemaVersion: '1.0.0',
    source: { sha256: sourceHash },
    statistics: { boardLessons: 0, exerciseLinks: 4, lessonCount: 2, moduleCount: 2, stepCount: 6 },
  };
}

describeDatabase('lesson importer database integration', () => {
  let sql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
    await sql`DELETE FROM courses WHERE slug = ${courseSlug}`;
    const [course] = await sql<{ id: string }[]>`
      INSERT INTO courses (slug, title, description) VALUES (${courseSlug}, 'Importer test', 'Temporary') RETURNING id
    `;
    for (const module of [1, 2])
      await sql`
        INSERT INTO course_modules (course_id, position, title, source_volume)
        VALUES (${course!.id}, ${module}, ${`Module ${module}`}, ${module})
      `;
  });

  afterAll(async () => {
    await sql`DELETE FROM courses WHERE slug = ${courseSlug}`;
    await sql`DELETE FROM lesson_import_runs WHERE source_name LIKE 'lesson-importer-%'`;
    await sql.end({ timeout: 5 });
  });

  it('is idempotent and versions only changed content', async () => {
    const dataset = normalizeLessonDataset(raw(), 'lesson-importer-idempotency.json');
    const first = await persistLessonDataset(sql, dataset, { courseSlug });
    const second = await persistLessonDataset(sql, dataset, { courseSlug });
    expect(first).toMatchObject({ changed: 2, unchanged: 0 });
    expect(second).toMatchObject({ changed: 0, unchanged: 2 });

    const changed = normalizeLessonDataset(
      raw('Second lesson revised'),
      'lesson-importer-revision.json',
    );
    const third = await persistLessonDataset(sql, changed, { courseSlug });
    expect(third).toMatchObject({ changed: 1, unchanged: 1 });

    const [state] = await sql<{ lessons: number; runs: number; versions: number }[]>`
      SELECT
        (SELECT count(*)::integer FROM lessons l JOIN course_modules cm ON cm.id = l.module_id
          JOIN courses c ON c.id = cm.course_id WHERE c.slug = ${courseSlug}) AS lessons,
        (SELECT count(*)::integer FROM lesson_import_runs WHERE source_name LIKE 'lesson-importer-%') AS runs,
        (SELECT count(*)::integer FROM lesson_versions lv JOIN lessons l ON l.id = lv.lesson_id
          JOIN course_modules cm ON cm.id = l.module_id JOIN courses c ON c.id = cm.course_id
          WHERE c.slug = ${courseSlug}) AS versions
    `;
    expect(state).toEqual({ lessons: 2, runs: 3, versions: 3 });
  });

  it('rolls back the run and prior updates on a slug conflict', async () => {
    const [module] = await sql<{ id: string }[]>`
      SELECT cm.id FROM course_modules cm JOIN courses c ON c.id = cm.course_id
      WHERE c.slug = ${courseSlug} AND cm.source_volume = 2
    `;
    await sql`
      INSERT INTO lessons (module_id, slug, position, title, estimated_minutes)
      VALUES (${module!.id}, 'occupied-slug', 99, 'Occupied', 8)
    `;
    const [before] = await sql<{ runs: number; title: string }[]>`
      SELECT
        (SELECT count(*)::integer FROM lesson_import_runs WHERE source_name = 'lesson-importer-failure.json') AS runs,
        (SELECT l.title FROM lessons l JOIN course_modules cm ON cm.id = l.module_id
          JOIN courses c ON c.id = cm.course_id WHERE c.slug = ${courseSlug} AND cm.source_volume = 2 AND l.position = 1) AS title
    `;
    const failing = normalizeLessonDataset(
      raw('Must roll back', 'occupied-slug'),
      'lesson-importer-failure.json',
    );
    await expect(persistLessonDataset(sql, failing, { courseSlug })).rejects.toThrow();
    const [after] = await sql<{ runs: number; title: string }[]>`
      SELECT
        (SELECT count(*)::integer FROM lesson_import_runs WHERE source_name = 'lesson-importer-failure.json') AS runs,
        (SELECT l.title FROM lessons l JOIN course_modules cm ON cm.id = l.module_id
          JOIN courses c ON c.id = cm.course_id WHERE c.slug = ${courseSlug} AND cm.source_volume = 2 AND l.position = 1) AS title
    `;
    expect(after).toEqual(before);
  });
});
