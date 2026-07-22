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
      url: '/v1/exercises?difficulty=beginner&positionType=legal_position&q=corredor',
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

    const incorrect = await app.inject({
      headers: auth(),
      method: 'POST',
      payload: { durationMs: 700, submittedLine: ['e2e3'], trainingSessionId: sessionId },
      url: `/v1/exercises/${exerciseId}/attempts`,
    });
    expect(incorrect.statusCode, incorrect.body).toBe(201);
    expect(incorrect.json()).toMatchObject({
      correct: false,
      training: { completed: 0, position: 1, status: 'started', total: 1 },
    });
    expect(incorrect.json().training.currentExercise.id).toBe(exerciseId);

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
      accuracyPercent: 60,
      attempted: 5,
      correct: 3,
      hintsUsed: 1,
    });
  });

  it('grades a mate-in-two incrementally and excludes it once solved', async () => {
    await sql`
      INSERT INTO exercises (
        external_id, source_number, module_number, chapter_number, title, prompt_md,
        solution_md, difficulty, category, fen, side_to_move, solution_lines, hints,
        tags, status, position_type, import_metadata
      ) VALUES (
        'evaluate-line-mate-in-two', 1301, 1, 1, 'Mate em dois de teste',
        'Calcule a sequência forçada.', '1.Qg8+ Rxg8 2.Nf7#', 'advanced', 'Desafios de teste',
        '5r1k/6pp/4Q2N/8/8/8/8/K7 w - - 0 1', 'white',
        '[ ["e6g8", "f8g8", "h6f7"] ]'::jsonb, '["Sacrifício de dama."]'::jsonb,
        ARRAY['evaluatelinetest'], 'published', 'legal_position',
        '{"answerFormat":"move_sequence"}'::jsonb
      )
      ON CONFLICT (external_id) DO UPDATE SET updated_at = now()
    `;

    const started = await app.inject({
      headers: auth(),
      method: 'POST',
      payload: { filters: { limit: 5, q: 'evaluatelinetest' } },
      url: '/v1/exercise-training-sessions',
    });
    expect(started.statusCode, started.body).toBe(201);
    const sessionId = started.json().sessionId as string;
    const mateExerciseId = started.json().currentExercise.id as string;

    const step1 = await app.inject({
      headers: auth(),
      method: 'POST',
      payload: { trainingSessionId: sessionId, playedMoves: ['e6g8'] },
      url: `/v1/exercises/${mateExerciseId}/evaluate-line`,
    });
    expect(step1.statusCode, step1.body).toBe(201);
    expect(step1.json()).toMatchObject({
      status: 'continue',
      opponentReply: 'f8g8',
      movesConfirmed: 1,
      attempt: null,
    });

    const step2 = await app.inject({
      headers: auth(),
      method: 'POST',
      payload: { trainingSessionId: sessionId, playedMoves: ['e6g8', 'h6f7'] },
      url: `/v1/exercises/${mateExerciseId}/evaluate-line`,
    });
    expect(step2.statusCode, step2.body).toBe(201);
    expect(step2.json()).toMatchObject({ status: 'solved', opponentReply: null });
    expect(step2.json().attempt).toMatchObject({ correct: true });

    const restarted = await app.inject({
      headers: auth(),
      method: 'POST',
      payload: { filters: { limit: 5, q: 'evaluatelinetest' } },
      url: '/v1/exercise-training-sessions',
    });
    expect(restarted.statusCode, restarted.body).toBe(201);
    expect(restarted.json().total).toBe(0);
  });

  it('returns verified study context from the linked lesson', async () => {
    const [module] = await sql<{ id: string }[]>`
      SELECT id FROM course_modules ORDER BY position LIMIT 1
    `;
    const [lesson] = await sql<{ id: string }[]>`
      INSERT INTO lessons (module_id, slug, position, title, status, source_pages)
      VALUES (${module!.id}, 'study-context-lesson', 999, 'Aula de estudo', 'published', '[4,6)'::int4range)
      ON CONFLICT (module_id, slug) DO UPDATE SET title = excluded.title
      RETURNING id
    `;
    await sql`
      INSERT INTO lesson_steps (lesson_id, step_key, position, step_type, title, body_md)
      VALUES
        (${lesson!.id}, 'objetivo', 1, 'text', 'Objetivo', 'Estude o princípio antes de responder.'),
        (${lesson!.id}, 'pergunta', 2, 'quiz', 'Pergunta', 'Esta parte é um quiz e não deve aparecer.')
      ON CONFLICT DO NOTHING
    `;
    await sql`
      INSERT INTO lesson_exercises (lesson_id, exercise_id, position)
      VALUES (${lesson!.id}, ${textualExerciseId}, 1)
      ON CONFLICT (lesson_id, exercise_id) DO NOTHING
    `;

    const study = await app.inject({
      headers: auth(),
      method: 'GET',
      url: `/v1/exercises/${textualExerciseId}/study`,
    });
    expect(study.statusCode, study.body).toBe(200);
    const body = study.json();
    expect(body.lessonTitle).toBe('Aula de estudo');
    expect(body.teaching).toEqual([
      { title: 'Objetivo', bodyMd: 'Estude o princípio antes de responder.' },
    ]);
    expect(body.sourcePages).toEqual([4, 5]);
  });

  it('reports a wrong first move as incorrect without advancing', async () => {
    await sql`
      INSERT INTO exercises (
        external_id, source_number, module_number, chapter_number, title, prompt_md,
        solution_md, difficulty, category, fen, side_to_move, solution_lines, hints,
        tags, status, position_type, import_metadata
      ) VALUES (
        'evaluate-line-wrong-move', 1302, 1, 1, 'Lance único de teste',
        'Encontre o lance.', '1.Re8#', 'beginner', 'Desafios de teste',
        '6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1', 'white',
        '[ ["e1e8"] ]'::jsonb, '["Torre para a oitava."]'::jsonb,
        ARRAY['wrongmovetest'], 'published', 'legal_position',
        '{"answerFormat":"move_sequence"}'::jsonb
      )
      ON CONFLICT (external_id) DO UPDATE SET updated_at = now()
    `;
    const started = await app.inject({
      headers: auth(),
      method: 'POST',
      payload: { filters: { limit: 1, q: 'wrongmovetest' } },
      url: '/v1/exercise-training-sessions',
    });
    const sessionId = started.json().sessionId as string;
    const currentId = started.json().currentExercise.id as string;

    const wrong = await app.inject({
      headers: auth(),
      method: 'POST',
      payload: { trainingSessionId: sessionId, playedMoves: ['e2e3'] },
      url: `/v1/exercises/${currentId}/evaluate-line`,
    });
    expect(wrong.statusCode, wrong.body).toBe(201);
    expect(wrong.json()).toMatchObject({ status: 'incorrect', attempt: null });

    const session = await app.inject({
      headers: auth(),
      method: 'GET',
      url: `/v1/exercise-training-sessions/${sessionId}`,
    });
    expect(session.json()).toMatchObject({ position: 1, status: 'started' });
  });
});
