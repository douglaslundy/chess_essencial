import { describe, expect, it } from 'vitest';

import { healthStatusSchema } from './health.js';

describe('healthStatusSchema', () => {
  it('accepts an authoritative health response', () => {
    const result = healthStatusSchema.parse({
      service: 'api',
      status: 'ok',
      timestamp: '2026-07-16T20:00:00.000Z',
    });

    expect(result.status).toBe('ok');
  });

  it('rejects an unknown service', () => {
    expect(() =>
      healthStatusSchema.parse({
        service: 'database',
        status: 'ok',
        timestamp: '2026-07-16T20:00:00.000Z',
      }),
    ).toThrow();
  });
});
