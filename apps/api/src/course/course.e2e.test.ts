import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../bootstrap.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

describeDatabase('course trail progress database integration', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let token = '';

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    const registration = await app.inject({
      method: 'POST',
      payload: {
        displayName: 'Aluno do curso',
        email: 'course-trail@example.com',
        password: 'course trail integration password 2026',
        username: 'course_trail',
      },
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
      payload: {
        identifier: 'course-trail@example.com',
        password: 'course trail integration password 2026',
      },
      url: '/v1/auth/login',
    });
    token = login.json().tokens.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ authorization: `Bearer ${token}` });

  it('requires a session', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/course-trail/progress' });
    expect(response.statusCode).toBe(401);
  });

  it('records each finished activity once', async () => {
    const empty = await app.inject({
      headers: auth(),
      method: 'GET',
      url: '/v1/course-trail/progress',
    });
    expect(empty.json()).toEqual({ completedActivityIds: [] });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const done = await app.inject({
        headers: auth(),
        method: 'PUT',
        url: '/v1/course-trail/progress/torre-1',
      });
      expect(done.statusCode).toBe(200);
      expect(done.json()).toEqual({ completedActivityIds: ['torre-1'] });
    }
  });

  it('rejects an invalid activity id', async () => {
    const response = await app.inject({
      headers: auth(),
      method: 'PUT',
      url: '/v1/course-trail/progress/Torre%20Errada',
    });
    expect(response.statusCode).toBe(400);
  });
});
