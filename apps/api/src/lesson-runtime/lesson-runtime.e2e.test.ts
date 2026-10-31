import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../bootstrap.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;
const lessonId = '00000000-0000-4000-8000-000000000999';
const neighbourLessons = [
  ['00000000-0000-4000-8000-000000000998', 998],
  ['00000000-0000-4000-8000-000000001000', 1000],
] as const;

describeDatabase('lesson runtime database integration', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let sql: ReturnType<typeof postgres>;
  let token = '';
  let otherToken = '';
  let attemptId = '';

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
    const [module] = await sql<{ id: string }[]>`
      SELECT cm.id FROM course_modules cm JOIN courses c ON c.id = cm.course_id
      WHERE c.slug = 'xadrez-essencial' AND cm.source_volume = 1
    `;
    await sql`
      INSERT INTO lessons (id, module_id, slug, position, title, estimated_minutes, status, version)
      VALUES (${lessonId}, ${module!.id}, 'runtime-integration-fixture', 999,
        'Runtime integration fixture', 8, 'published', 1)
      ON CONFLICT (id) DO UPDATE SET status = 'published'
    `;
    // Published neighbours for previous/next navigation; the seed no longer ships book lessons.
    for (const [id, position] of neighbourLessons)
      await sql`
        INSERT INTO lessons (id, module_id, slug, position, title, estimated_minutes, status, version)
        VALUES (${id}, ${module!.id}, ${`runtime-integration-neighbour-${position}`}, ${position},
          'Runtime integration neighbour', 8, 'published', 1)
        ON CONFLICT (id) DO UPDATE SET status = 'published'
      `;
    for (const [id] of neighbourLessons)
      await sql`INSERT INTO lesson_source_pages (lesson_id, page) VALUES (${id}, 1) ON CONFLICT DO NOTHING`;
    await sql`DELETE FROM lesson_steps WHERE lesson_id = ${lessonId}`;
    await sql`DELETE FROM lesson_source_pages WHERE lesson_id = ${lessonId}`;
    const steps = [
      {
        key: 'boas-vindas',
        type: 'text',
        body: 'Start the runtime test.',
        actions: [],
        feedback: {},
      },
      {
        key: 'mova-o-peao',
        type: 'board_instruction',
        body: 'Move b2 to b3.',
        fen: '4k3/8/8/8/8/8/1P6/4K3 w - - 0 1',
        actions: [{ type: 'move', uci: 'b2b3' }],
        feedback: { correct: 'Correct.', incorrect: 'Tente mover o pe\u00e3o de b2 para b3.' },
      },
      {
        key: 'confirme-a-casa',
        type: 'quiz',
        body: 'Where did the pawn finish?',
        actions: [{ type: 'answer', value: 'b3' }],
        feedback: { correct: 'Correct.', incorrect: 'Try b3.' },
      },
      {
        key: 'explicacao',
        type: 'explanation',
        body: 'The pawn advanced one square.',
        actions: [],
        feedback: {},
      },
      { key: 'resumo', type: 'summary', body: 'Runtime test complete.', actions: [], feedback: {} },
    ];
    for (const [index, step] of steps.entries())
      await sql`
        INSERT INTO lesson_steps (lesson_id, step_key, position, step_type, body_md, initial_fen,
          orientation, expected_actions, feedback, next_step_rules)
        VALUES (${lessonId}, ${step.key}, ${index + 1}, ${step.type}, ${step.body},
          ${'fen' in step ? step.fen : null}, 'white', ${JSON.stringify(step.actions)}::text::jsonb,
          ${JSON.stringify(step.feedback)}::text::jsonb, '[]'::jsonb)
      `;
    await sql`INSERT INTO lesson_source_pages (lesson_id, page) VALUES (${lessonId}, 1)`;
    token = await identity('lesson-student@example.com', 'lesson_student');
    otherToken = await identity('other-student@example.com', 'other_student');
  });

  afterAll(async () => {
    await sql`UPDATE user_course_enrollments SET last_lesson_id = NULL WHERE last_lesson_id = ${lessonId}`;
    await sql`DELETE FROM lessons WHERE id = ${lessonId}`;
    for (const [id] of neighbourLessons) await sql`DELETE FROM lessons WHERE id = ${id}`;
    await sql.end({ timeout: 5 });
    await app.close();
  });

  async function identity(email: string, username: string) {
    const registration = await app.inject({
      method: 'POST',
      payload: {
        displayName: username,
        email,
        password: 'lesson integration password 2026',
        username,
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
      payload: { identifier: email, password: 'lesson integration password 2026' },
      url: '/v1/auth/login',
    });
    return login.json().tokens.accessToken as string;
  }

  const auth = (accessToken = token) => ({ authorization: `Bearer ${accessToken}` });
  const action = (payload: object) =>
    app.inject({
      headers: auth(),
      method: 'POST',
      payload,
      url: `/v1/lesson-attempts/${attemptId}/actions`,
    });

  it('reveals only the current sanitized step and resumes the same attempt', async () => {
    const overview = await app.inject({
      headers: auth(),
      method: 'GET',
      url: `/v1/lessons/${lessonId}`,
    });
    expect(overview.statusCode, overview.body).toBe(200);
    expect(overview.json().firstStep.stepKey).toBe('boas-vindas');
    expect(overview.json().courseSlug).toBe('xadrez-essencial');
    expect(typeof overview.json().nextLessonId).toBe('string');
    expect(typeof overview.json().previousLessonId).toBe('string');
    expect(overview.body).not.toContain('expectedActions');
    expect(overview.body).not.toContain('mova-o-peao');

    const started = await app.inject({
      headers: auth(),
      method: 'POST',
      payload: { lessonId },
      url: '/v1/lesson-attempts',
    });
    expect(started.statusCode, started.body).toBe(201);
    attemptId = started.json().attemptId;
    expect(started.json()).toMatchObject({
      currentStep: { stepKey: 'boas-vindas', stepType: 'text' },
      progress: { completedSteps: 0, totalSteps: 5 },
      status: 'started',
    });
    expect(started.body).not.toContain('expectedActions');
    expect(started.body).not.toContain('confirme-a-casa');

    const resumed = await app.inject({
      headers: auth(),
      method: 'POST',
      payload: { lessonId },
      url: '/v1/lesson-attempts',
    });
    expect(resumed.json().attemptId).toBe(attemptId);
  });

  it('persists every action and changes state from server-side answers', async () => {
    let response = await action({ type: 'continue' });
    expect(response.json().currentStep.stepKey).toBe('mova-o-peao');

    response = await action({ type: 'move', uci: 'b2b5' });
    expect(response.json()).toMatchObject({
      currentStep: { stepKey: 'mova-o-peao' },
      feedback: 'Tente mover o peão de b2 para b3.',
    });

    const restored = await app.inject({
      headers: auth(),
      method: 'GET',
      url: `/v1/lesson-attempts/${attemptId}`,
    });
    expect(restored.json().feedback).toContain('b2 para b3');

    response = await action({ type: 'move', uci: 'b2b3' });
    expect(response.json().currentStep.stepKey).toBe('confirme-a-casa');

    response = await action({ type: 'answer', value: 'b4' });
    expect(response.json().currentStep.stepKey).toBe('confirme-a-casa');

    response = await action({ type: 'answer', value: 'b3' });
    expect(response.json().currentStep.stepKey).toBe('explicacao');

    response = await action({ type: 'continue' });
    expect(response.json().currentStep.stepKey).toBe('resumo');

    response = await action({ type: 'continue' });
    expect(response.json()).toMatchObject({
      currentStep: null,
      progress: { completedSteps: 5, totalSteps: 5 },
      score: 50,
      status: 'completed',
    });

    const [ledger] = await sql<{ count: number }[]>`
      SELECT count(*)::integer AS count FROM lesson_attempt_actions WHERE attempt_id = ${attemptId}
    `;
    expect(ledger!.count).toBe(7);
  });

  it('lists the completed lesson in this course only for the student who finished it', async () => {
    const mine = await app.inject({
      headers: auth(),
      method: 'GET',
      url: '/v1/courses/xadrez-essencial/progress',
    });
    expect(mine.statusCode, mine.body).toBe(200);
    expect(mine.json().completedLessonIds).toContain(lessonId);

    const theirs = await app.inject({
      headers: auth(otherToken),
      method: 'GET',
      url: '/v1/courses/xadrez-essencial/progress',
    });
    expect(theirs.statusCode, theirs.body).toBe(200);
    expect(theirs.json().completedLessonIds).not.toContain(lessonId);
  });

  it('does not expose another user attempt', async () => {
    const response = await app.inject({
      headers: auth(otherToken),
      method: 'GET',
      url: `/v1/lesson-attempts/${attemptId}`,
    });
    expect(response.statusCode).toBe(404);
  });
});
