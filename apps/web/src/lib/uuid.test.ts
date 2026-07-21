import { describe, expect, it, vi } from 'vitest';

import { randomUUID } from './uuid';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomUUID', () => {
  it('delegates to crypto.randomUUID when it is available', () => {
    const spy = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValue('11111111-1111-4111-8111-111111111111');
    expect(randomUUID()).toBe('11111111-1111-4111-8111-111111111111');
    spy.mockRestore();
  });

  it('falls back to crypto.getRandomValues when randomUUID is unavailable', () => {
    const original = crypto.randomUUID;
    // @ts-expect-error simulating an insecure context, where crypto.randomUUID does not exist
    delete crypto.randomUUID;
    try {
      expect(randomUUID()).toMatch(UUID_V4_PATTERN);
    } finally {
      crypto.randomUUID = original;
    }
  });
});
