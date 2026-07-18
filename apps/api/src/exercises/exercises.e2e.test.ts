import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../bootstrap.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

describeDatabase('exercise runtime database integration', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let sql: ReturnType<typeof postgres>;
  let token = '';
  let exerciseId = '';
  let textualExerciseId = '';

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
    const registration = await app.inject({
      method: 'POST',
      payload: {
        displayName: 'Exercise student',
        email: 'exercise-student@example.com',
        password: 'exercise integration password 2026',
        username: 'exercise_student',
      },
      url: '/v1/auth/register',
    });
    await app.inject({
      method: 'POST',
      payload: { token: registration.json().verificationToken },
      url: '/v1/auth/verify',
    });
    const login = await app.inject({
      method: 'POST',
      payload: {
        identifier: 'exercise-student@example.com',
        password: 'exercise integration password 2026',
      },
      url: '/v1/auth/login',
    });
    token = login.json().tokens.accessToken;
    const [exercise] = await sql<{ id: string }[]>`
      INSERT INTO exercises (
        external_id, source_number, module_number, chapter_number, title, prompt_md,
        solution_md, difficulty, category, fen, side_to_move, solution_lines, hints,
        tags, status, position_type
      ) VALUES (
        'phase-10-integration', 1299, 1, 1, 'Advance o peao', 'Encontre o lance correto.',
        'e2e4', 'easy', 'pawn', '8/8/8/8/8/8/4P3/4K2k w - - 0 1', 'white',
        '[ ["e2e4"] ]'::jsonb, '["Use o peao da coluna e."]'::jsonb,
        ARRAY['pawn'], 'published', 'legal_position'
      )
      ON CONFLICT (external_id) DO UPDATE SET updated_at = now()
      RETURNING id
    `;
    exerciseId = exercise!.id;
    const [textualExercise] = await sql<{ id: string }[]>`
      INSERT INTO exercises (
        external_id, source_number, module_number, chapter_number, title, prompt_md,
        solution_md, category, solution_lines, hints, tags, status, position_type, import_metadata
      ) VALUES (
        'phase-10-text-integration', 1300, 1, 1, 'Explain the idea', 'Give the reference answer.',
        'A reasoned answer.', 'concept', '[]'::jsonb, '[]'::jsonb,
        ARRAY['concept'], 'published', 'text_only', '{"answerFormat":"free_text"}'::jsonb
      )
      ON CONFLICT (external_id) DO UPDATE SET updated_at = now()
      RETURNING id
    `;
    textualExerciseId = textualExercise!.id;
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
    await app.close();
  });

  const auth = () => ({ authorization: `Bearer ${token}` });

  it('searches with filters without exposing hints or solutions', async () => {
    const response = await app.inject({
      headers: auth(),
      method: 'GET',
      url: '/v1/exercises?category=pawn&module=1&q=correto',
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ limit: 20, offset: 0, total: 1 });
    expect(response.json().items[0].id).toBe(exerciseId);
    expect(response.body).not.toContain('solutionMd');
    expect(response.body).not.toContain('hints');
  });

  it('serves and authoritatively scores the curated mate-in-one challenge', async () => {
    const search = await app.inject({
      headers: auth(),
      method: 'GET',
      url: '/v1/exercises?difficulty=beginner&positionType=legal_position&q=mate_em_um',
    });
    expect(search.statusCode, search.body).toBe(200);
    expect(search.json().total).toBeGreaterThanOrEqual(1);
    const challenge = search
      .json()
      .items.find((item: { title?: string }) => item.title === 'Mate em um: corredor');
    expect(challenge).toBeTruthy();

    const attempt = await app.inject({
      headers: auth(),
      method: 'POST',
      payload: { durationMs: 900, submittedLine: ['e1e8'] },
      url: `/v1/exercises/${challenge.id}/attempts`,
    });
    expect(attempt.statusCode, attempt.body).toBe(201);
    expect(attempt.json()).toMatchObject({ correct: true, score: 100 });
  });

  it('runs training, reveals one hint and scores the server-validated answer', async () => {
    const started = await app.inject({
      headers: auth(),
      method: 'POST',
      payload: { filters: { category: 'pawn', limit: 1, q: 'correto' } },
      url: '/v1/exercise-training-sessions',
    });
    expect(started.statusCode, started.body).toBe(201);
    expect(started.json()).toMatchObject({ status: 'started', total: 1 });
    const sessionId = started.json().sessionId as string;

    const hint = await app.inject({
      headers: auth(),
      method: 'POST',
      url: `/v1/exercise-training-sessions/${sessionId}/hints`,
    });
    expect(hint.json()).toMatchObject({ hintNumber: 1, remaining: 0 });

    const attempt = await app.inject({
      headers: auth(),
      method: 'POST',
      payload: { durationMs: 1200, submittedLine: ['e2e4'], trainingSessionId: sessionId },
      url: `/v1/exercises/${exerciseId}/attempts`,
    });
    expect(attempt.statusCode, attempt.body).toBe(201);
    expect(attempt.json()).toMatchObject({
      correct: true,
      hintsUsed: 1,
      score: 90,
      training: { completed: 1, status: 'completed', total: 1 },
    });
  });

  it('evaluates free-text answers from the server reference', async () => {
    const response = await app.inject({
      headers: auth(),
      method: 'POST',
      payload: { durationMs: 500, submittedLine: ['A reasoned answer.'] },
      url: `/v1/exercises/${textualExerciseId}/attempts`,
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({ correct: true, score: 100 });
  });
  it('rejects an illegal submitted line as incorrect and reports user metrics', async () => {
    const attempt = await app.inject({
      headers: auth(),
      method: 'POST',
      payload: { durationMs: 800, submittedLine: ['e2e5'] },
      url: `/v1/exercises/${exerciseId}/attempts`,
    });
    expect(attempt.json()).toMatchObject({ correct: false, score: 0, training: null });

    const metrics = await app.inject({
      headers: auth(),
      method: 'GET',
      url: '/v1/exercise-metrics',
    });
    expect(metrics.statusCode, metrics.body).toBe(200);
    expect(metrics.json()).toMatchObject({
      accuracyPercent: 75,
      attempted: 4,
      correct: 3,
      hintsUsed: 1,
    });
  });
});
