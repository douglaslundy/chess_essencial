import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../bootstrap.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

describeDatabase('classroom database integration', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  const tokens: Record<string, string> = {};

  async function signUp(username: string) {
    const password = 'classroom integration password 2026';
    const registration = await app.inject({
      method: 'POST',
      payload: { displayName: username, email: `${username}@example.com`, password, username },
      url: '/v1/auth/register',
    });
    expect(registration.statusCode).toBe(201);
    await app.inject({
      method: 'POST',
      payload: { token: registration.json().verificationToken },
      url: '/v1/auth/verify',
    });
    const login = await app.inject({
      method: 'POST',
      payload: { identifier: `${username}@example.com`, password },
      url: '/v1/auth/login',
    });
    tokens[username] = login.json().tokens.accessToken;
  }

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    await signUp('class_teacher');
    await signUp('class_student');
    await signUp('class_stranger');
  });

  afterAll(async () => {
    await app.close();
  });

  const call = (
    user: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    payload: object = {},
  ) =>
    app.inject({
      headers: { authorization: `Bearer ${tokens[user]}` },
      method,
      url,
      ...(method === 'GET' || method === 'DELETE' ? {} : { payload }),
    });

  it('lets the teacher add a student, publish a page and the student follow it', async () => {
    const created = await call('class_teacher', 'POST', '/v1/classrooms', { name: 'Aula 1' });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;

    expect(
      (
        await call('class_teacher', 'POST', `/v1/classrooms/${id}/members`, {
          identifier: 'class_student',
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await call('class_teacher', 'POST', `/v1/classrooms/${id}/members`, {
          identifier: 'nobody_here',
        })
      ).statusCode,
    ).toBe(422);

    expect((await call('class_student', 'GET', '/v1/classrooms')).json()).toHaveLength(1);
    expect((await call('class_stranger', 'GET', `/v1/classrooms/${id}`)).statusCode).toBe(404);

    expect(
      (await call('class_student', 'PUT', `/v1/classrooms/${id}/live`, { path: '/app/curso' }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await call('class_teacher', 'PUT', `/v1/classrooms/${id}/live`, {
          path: 'https://evil.example',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await call('class_teacher', 'PUT', `/v1/classrooms/${id}/live`, {
          path: '/app/biblioteca?q=sicilian',
        })
      ).statusCode,
    ).toBe(204);

    const live = await call('class_student', 'GET', `/v1/classrooms/${id}/live`);
    expect(live.json()).toEqual({ path: '/app/biblioteca?q=sicilian', seq: 1 });
  });
});
