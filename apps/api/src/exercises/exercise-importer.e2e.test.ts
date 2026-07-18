import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { normalizeExerciseDataset, persistExerciseDataset } from './exercise-importer.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

describeDatabase('exercise importer database integration', () => {
  let sql: ReturnType<typeof postgres>;

  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
  });

  afterAll(async () => {
    await sql`DELETE FROM exercises WHERE source_number IN (50000, 50001, 50002)`;
    await sql`DELETE FROM exercise_import_runs WHERE source_name LIKE 'phase14-%'`;
    await sql.end({ timeout: 5 });
  });

  it('reimports without duplicates and replaces stale lesson links', async () => {
    const mapped = normalizeExerciseDataset(
      [
        {
          id: 'phase14-idempotent',
          module: 1,
          chapter: 1,
          number: 50000,
          pages: [4],
          prompt: 'Explain the mapped concept.',
          solution: 'Mapped answer.',
        },
      ],
      'phase14-idempotency.json',
    );

    const first = await persistExerciseDataset(sql, mapped);
    const second = await persistExerciseDataset(sql, mapped);
    expect(first.importRunId).not.toBe(second.importRunId);

    const [state] = await sql<{ exercises: number; links: number; runs: number }[]>`
      SELECT
        (SELECT count(*)::integer FROM exercises WHERE source_number = 50000) AS exercises,
        (SELECT count(*)::integer FROM lesson_exercises le
          JOIN exercises e ON e.id = le.exercise_id WHERE e.source_number = 50000) AS links,
        (SELECT count(*)::integer FROM exercise_import_runs
          WHERE source_name = 'phase14-idempotency.json') AS runs
    `;
    expect(state).toEqual({ exercises: 1, links: 1, runs: 2 });

    const remapped = normalizeExerciseDataset(
      [
        {
          id: 'phase14-idempotent',
          module: 2,
          chapter: 1,
          number: 50000,
          pages: [999],
          prompt: 'Explain the mapped concept.',
          solution: 'Mapped answer.',
        },
      ],
      'phase14-remap.json',
    );
    await persistExerciseDataset(sql, remapped);

    const [remappedState] = await sql<{ links: number; module_number: number }[]>`
      SELECT e.module_number,
        count(le.*)::integer AS links
        FROM exercises e
        LEFT JOIN lesson_exercises le ON le.exercise_id = e.id
       WHERE e.source_number = 50000
       GROUP BY e.id
    `;
    expect(remappedState).toEqual({ links: 0, module_number: 2 });
  });

  it('rolls back the whole run when one exercise cannot be persisted', async () => {
    const baseline = normalizeExerciseDataset(
      [
        {
          id: 'phase14-rollback-shared',
          number: 50001,
          prompt: 'Original prompt.',
          solution: 'Original answer.',
        },
      ],
      'phase14-rollback-baseline.json',
    );
    await persistExerciseDataset(sql, baseline);
    const [before] = await sql<{ runs: number }[]>`
      SELECT count(*)::integer AS runs
        FROM exercise_import_runs
       WHERE source_name = 'phase14-rollback-failure.json'
    `;

    const failing = normalizeExerciseDataset(
      [
        {
          id: 'phase14-rollback-shared',
          number: 50001,
          prompt: 'Changed inside failed transaction.',
          solution: 'Changed answer.',
        },
        {
          id: 'phase14-rollback-shared',
          number: 50002,
          prompt: 'Conflicting external id.',
          solution: 'Conflict.',
        },
      ],
      'phase14-rollback-failure.json',
    );

    await expect(persistExerciseDataset(sql, failing)).rejects.toThrow();

    const [state] = await sql<{ extra: number; prompt_md: string; runs: number }[]>`
      SELECT
        (SELECT prompt_md FROM exercises WHERE source_number = 50001) AS prompt_md,
        (SELECT count(*)::integer FROM exercises WHERE source_number = 50002) AS extra,
        (SELECT count(*)::integer FROM exercise_import_runs
          WHERE source_name = 'phase14-rollback-failure.json') AS runs
    `;
    expect(state).toEqual({ extra: 0, prompt_md: 'Original prompt.', runs: before!.runs });
  });
});
