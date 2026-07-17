import { describe, expect, it } from 'vitest';

import { registerInputSchema, updateMeInputSchema } from './auth.js';

describe('authentication contracts', () => {
  it('rejects weak passwords and invalid usernames', () => {
    expect(
      registerInputSchema.safeParse({
        displayName: 'A',
        email: 'invalid',
        password: 'short',
        username: 'nome com espaço',
      }).success,
    ).toBe(false);
  });

  it('normalizes profile settings and rejects empty updates', () => {
    expect(updateMeInputSchema.safeParse({}).success).toBe(false);
    expect(updateMeInputSchema.parse({ countryCode: 'br' }).countryCode).toBe('BR');
  });
});
