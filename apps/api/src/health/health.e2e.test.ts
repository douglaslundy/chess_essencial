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

  it('rate limits repeated authentication requests', async () => {
    const responses = [];
    for (let index = 0; index < 11; index += 1) {
      responses.push(await app.inject({ method: 'POST', payload: {}, url: '/v1/auth/register' }));
    }
    expect(responses.at(-1)?.statusCode).toBe(429);
    expect(responses.at(-1)?.headers['retry-after']).toBeDefined();
  });
});
