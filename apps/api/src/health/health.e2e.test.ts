import 'reflect-metadata';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../bootstrap.js';

describe('GET /v1/health', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responds through the Fastify adapter', async () => {
    const response = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/v1/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      service: 'api',
      status: 'ok',
    });
  });

  it('adds defensive headers and exposes aggregate metrics', async () => {
    const health = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(health.headers['content-security-policy']).toContain("default-src 'none'");
    expect(health.headers['x-content-type-options']).toBe('nosniff');
    expect(health.headers['x-frame-options']).toBe('DENY');
    expect(health.headers['x-request-id']).toBeTypeOf('string');

    const metrics = await app.inject({ method: 'GET', url: '/v1/metrics' });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.headers['content-type']).toContain('text/plain');
    expect(metrics.body).toContain('xadrez_http_requests_total');
  });

  it('requires JSON for mutable bodies', async () => {
    const response = await app.inject({
      headers: { 'content-type': 'text/plain' },
      method: 'POST',
      payload: 'not-json',
      url: '/v1/auth/login',
    });
    expect(response.statusCode).toBe(415);
    expect(response.json()).toMatchObject({ status: 415 });
  });

  it('rejects cookie-authenticated refresh without trusted CSRF proof', async () => {
    const response = await app.inject({
      headers: {
        cookie: 'xadrez_refresh=opaque-refresh-token',
        origin: 'https://attacker.example',
        'x-xadrez-csrf': '1',
      },
      method: 'POST',
      payload: {},
      url: '/v1/auth/refresh',
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ status: 403, title: 'Forbidden' });
  });

  it('rate limits repeated authentication requests', async () => {
    const responses = [];
    for (let index = 0; index < 11; index += 1) {
      responses.push(await app.inject({ method: 'POST', payload: {}, url: '/v1/auth/login' }));
    }
    expect(responses.at(-1)?.statusCode).toBe(429);
    expect(responses.at(-1)?.headers['retry-after']).toBeDefined();
  });

  it('does not charge CORS preflights or health probes to the request budget', async () => {
    const preflight = await app.inject({
      headers: {
        'access-control-request-method': 'GET',
        origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
      },
      method: 'OPTIONS',
      url: '/v1/me',
    });
    expect(preflight.headers['ratelimit-limit']).toBeUndefined();
    expect(preflight.headers['access-control-max-age']).toBe('600');
    const health = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(health.headers['ratelimit-limit']).toBeUndefined();
  });

  it('gives each player behind the proxy their own login budget', async () => {
    const login = (ip: string) =>
      app.inject({
        headers: { 'x-forwarded-for': ip },
        method: 'POST',
        payload: {},
        url: '/v1/auth/login',
      });
    for (let index = 0; index < 11; index += 1) await login('203.0.113.7');
    expect((await login('203.0.113.7')).statusCode).toBe(429);
    expect((await login('203.0.113.8')).statusCode).not.toBe(429);
  });
});
