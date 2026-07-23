import { describe, expect, it } from 'vitest';

import { parseWorkerEnv } from './env.js';

describe('parseWorkerEnv', () => {
  it('provides safe local defaults', () => {
    expect(parseWorkerEnv({})).toMatchObject({
      REDIS_URL: 'redis://localhost:6379',
      WORKER_HEALTH_PORT: 4001,
    });
  });

  it('rejects an invalid Redis URL', () => {
    expect(() => parseWorkerEnv({ REDIS_URL: 'not-a-url' })).toThrow();
  });

  it('rejects an invalid database URL', () => {
    expect(() => parseWorkerEnv({ DATABASE_URL: 'not-a-url' })).toThrow();
  });
});
