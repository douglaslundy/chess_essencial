import { describe, expect, it, vi } from 'vitest';

import type { MetricsService } from '../../observability/metrics.service.js';
import type { RedisService } from '../../redis/redis.service.js';
import { DistributedFixedWindowLimiter } from './http-security.js';

function dependencies(status: string, responses: Array<[number, number]> = []) {
  const evalMock = vi.fn(async () => responses.shift() ?? [1, 60_000]);
  const increment = vi.fn();
  return {
    evalMock,
    increment,
    metrics: { increment } as unknown as MetricsService,
    redis: { client: { eval: evalMock, status } } as unknown as RedisService,
  };
}

describe('DistributedFixedWindowLimiter', () => {
  it('uses the atomic Redis counter shared by replicas', async () => {
    const { evalMock, metrics, redis } = dependencies('ready', [
      [1, 60_000],
      [2, 59_000],
      [3, 58_000],
    ]);
    const limiter = new DistributedFixedWindowLimiter(redis, metrics, true);

    await expect(limiter.consume('login:ip', 2, 60_000, true)).resolves.toMatchObject({
      allowed: true,
      remaining: 1,
    });
    await expect(limiter.consume('login:ip', 2, 60_000, true)).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
    });
    await expect(limiter.consume('login:ip', 2, 60_000, true)).resolves.toMatchObject({
      allowed: false,
      retryAfterSeconds: 58,
    });
    expect(evalMock).toHaveBeenCalledTimes(3);
  });

  it('uses a stricter observable local fallback for sensitive production routes', async () => {
    const { increment, metrics, redis } = dependencies('end');
    const limiter = new DistributedFixedWindowLimiter(redis, metrics, true);

    for (let index = 0; index < 5; index += 1) {
      await expect(limiter.consume('login:ip', 10, 60_000, true)).resolves.toMatchObject({
        allowed: true,
      });
    }
    await expect(limiter.consume('login:ip', 10, 60_000, true)).resolves.toMatchObject({
      allowed: false,
      limit: 5,
    });
    expect(increment).toHaveBeenCalledWith('xadrez_http_rate_limit_fallback_total', {
      reason: 'redis_unavailable',
    });
  });
});
