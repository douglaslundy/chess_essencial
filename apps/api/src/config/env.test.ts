import { describe, expect, it } from 'vitest';

import { validateApiEnv } from './env.js';

describe('validateApiEnv', () => {
  it('provides local-only authentication defaults outside production', () => {
    const config = validateApiEnv({ NODE_ENV: 'test' });
    expect(config.AUTH_ACCESS_SECRET).toBeDefined();
    expect(config.AUTH_ACCESS_SECRET?.length).toBeGreaterThanOrEqual(32);
    expect(config.AUTH_EXPOSE_VERIFICATION_TOKEN).toBe(true);
  });

  it('requires every authentication secret in production', () => {
    expect(() => validateApiEnv({ NODE_ENV: 'production' })).toThrow(
      'Production authentication secrets are required',
    );
  });

  it('requires SMTP in production after authentication secrets are present', () => {
    expect(() =>
      validateApiEnv({
        AUTH_ACCESS_SECRET: 'a'.repeat(32),
        AUTH_IP_HASH_SECRET: 'b'.repeat(32),
        AUTH_REFRESH_SECRET: 'c'.repeat(32),
        AUTH_VERIFICATION_SECRET: 'd'.repeat(32),
        NODE_ENV: 'production',
      }),
    ).toThrow('Production SMTP_URL is required');
  });
});
