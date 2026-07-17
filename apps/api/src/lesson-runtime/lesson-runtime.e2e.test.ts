import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../bootstrap.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;
const lessonId = '00000000-0000-4000-8000-000000000901';

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
    token = await identity('lesson-student@example.com', 'lesson_student');
    otherToken = await identity('other-student@example.com', 'other_student');
  });

  afterAll(async () => {
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

  it('does not expose another user attempt', async () => {
    const response = await app.inject({
      headers: auth(otherToken),
      method: 'GET',
      url: `/v1/lesson-attempts/${attemptId}`,
    });
    expect(response.statusCode).toBe(404);
  });
});
