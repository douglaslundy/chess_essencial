import { describe, expect, it } from 'vitest';

import { registerInputSchema, resetPasswordInputSchema, updateMeInputSchema } from './auth.js';

describe('authentication contracts', () => {
  it('rejects invalid registration data', () => {
    expect(
      registerInputSchema.safeParse({
        displayName: 'A',
        email: 'invalid',
        password: 'short',
        username: 'nome com espaço',
      }).success,
    ).toBe(false);
  });

  it('requires at least 6 characters for registration passwords', () => {
    const input = {
      displayName: 'Jogador',
      email: 'jogador@example.com',
      username: 'jogador',
    };

    expect(registerInputSchema.safeParse({ ...input, password: '12345' }).success).toBe(false);
    expect(registerInputSchema.safeParse({ ...input, password: '123456' }).success).toBe(true);
  });

  it('normalizes profile settings and rejects empty updates', () => {
    expect(updateMeInputSchema.safeParse({}).success).toBe(false);
    expect(updateMeInputSchema.parse({ countryCode: 'br' }).countryCode).toBe('BR');
  });

  it('requires at least 6 characters and a bounded token when resetting a password', () => {
    expect(
      resetPasswordInputSchema.safeParse({ newPassword: '12345', token: 'a'.repeat(32) }).success,
    ).toBe(false);
    expect(
      resetPasswordInputSchema.safeParse({
        newPassword: '123456',
        token: 'a'.repeat(32),
      }).success,
    ).toBe(true);
  });
});
