import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../bootstrap.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

describeDatabase('course CMS database integration', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let sql: ReturnType<typeof postgres>;
  let token = '';
  let userId = '';
  let courseId = '';

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
    const registration = await app.inject({
      method: 'POST',
      payload: {
        displayName: 'Editor do curso',
        email: 'course-editor@example.com',
        password: 'course integration password 2026',
        username: 'course_editor',
      },
      url: '/v1/auth/register',
    });
    expect(registration.statusCode).toBe(201);
    userId = registration.json().user.id;
    await app.inject({
      method: 'POST',
      payload: { token: registration.json().verificationToken },
      url: '/v1/auth/verify',
    });
    const login = await app.inject({
      method: 'POST',
      payload: {
        identifier: 'course-editor@example.com',
        password: 'course integration password 2026',
      },
      url: '/v1/auth/login',
    });
    token = login.json().tokens.accessToken;
    const [course] = await sql<
      { id: string }[]
    >`SELECT id FROM courses WHERE slug = 'xadrez-essencial'`;
    courseId = course!.id;
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
    await app.close();
  });

  const auth = () => ({ authorization: `Bearer ${token}` });
  const lesson = (module: number, versionTitle = '') => ({
    estimatedMinutes: 8,
    module,
    prerequisites: [],
    slug: `modulo-${module}-introducao`,
    sourcePages: [module * 10],
    steps: [
      {
        bodyMd: `Conteúdo introdutório do módulo ${module}.`,
        stepKey: 'introducao',
        stepType: 'text',
      },
      {
        bodyMd: 'Resumo da aula.',
        stepKey: 'resumo',
        stepType: 'summary',
      },
    ],
    title: `Introdução ao módulo ${module}${versionTitle}`,
  });

  it('protects the editor with an explicit role', async () => {
    const denied = await app.inject({
      headers: auth(),
      method: 'GET',
      url: `/v1/courses/${courseId}/editor`,
    });
    expect(denied.statusCode).toBe(403);
    await sql`INSERT INTO user_roles (user_id, role) VALUES (${userId}, 'content_editor')`;
    const editor = await app.inject({
      headers: auth(),
      method: 'GET',
      url: `/v1/courses/${courseId}/editor`,
    });
    expect(editor.statusCode, editor.body).toBe(200);
    expect(editor.json().modules).toHaveLength(10);
  });

  it('versions lesson content and rejects stale saves', async () => {
    for (let module = 1; module <= 10; module += 1) {
      const response = await app.inject({
        headers: auth(),
        method: 'PUT',
        payload: { expectedVersion: 0, lesson: lesson(module) },
        url: `/v1/courses/${courseId}/lessons/modulo-${module}-introducao`,
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().version).toBe(1);
    }
    const versionTwo = await app.inject({
      headers: auth(),
      method: 'PUT',
      payload: { expectedVersion: 1, lesson: lesson(1, ' revisada') },
      url: `/v1/courses/${courseId}/lessons/modulo-1-introducao`,
    });
    expect(versionTwo.statusCode, versionTwo.body).toBe(200);
    expect(versionTwo.json().version).toBe(2);

    const stale = await app.inject({
      headers: auth(),
      method: 'PUT',
      payload: { expectedVersion: 1, lesson: lesson(1, ' obsoleta') },
      url: `/v1/courses/${courseId}/lessons/modulo-1-introducao`,
    });
    expect(stale.statusCode).toBe(409);

    const [versions] = await sql<{ count: number }[]>`
      SELECT count(*)::integer AS count FROM lesson_versions
      WHERE lesson_id = ${versionTwo.json().lessonId}
    `;
    expect(versions!.count).toBe(2);
  });

  it('publishes complete content and exposes only the published course', async () => {
    const published = await app.inject({
      headers: auth(),
      method: 'POST',
      url: `/v1/courses/${courseId}/publish`,
    });
    expect(published.statusCode, published.body).toBe(201);
    expect(published.json().status).toBe('published');

    const list = await app.inject({ method: 'GET', url: '/v1/courses' });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual([
      expect.objectContaining({ moduleCount: 10, slug: 'xadrez-essencial', status: 'published' }),
    ]);

    const detail = await app.inject({ method: 'GET', url: '/v1/courses/xadrez-essencial' });
    expect(detail.statusCode, detail.body).toBe(200);
    expect(detail.json().modules).toHaveLength(10);
    expect(
      detail.json().modules.every((module: { lessons: unknown[] }) => module.lessons.length === 1),
    ).toBe(true);
  });
});
