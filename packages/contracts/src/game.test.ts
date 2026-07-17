import { describe, expect, it } from 'vitest';

import { createGameInputSchema, submitMoveInputSchema } from './game.js';

describe('game contracts', () => {
  it('defaults the creator to white and validates UUIDs', () => {
    const parsed = createGameInputSchema.parse({
      opponentUserId: '018f47f4-7b2f-4d90-8a66-9abcdef01234',
      timeControlCode: 'blitz-3-0',
    });
    expect(parsed.creatorColor).toBe('white');
  });

  it('normalizes UCI and rejects client-supplied state', () => {
    const parsed = submitMoveInputSchema.parse({
      clientMoveId: '018f47f4-7b2f-4d90-8a66-8abcdef01234',
      expectedVersion: 0,
      uci: 'E2E4',
      fen: 'untrusted',
    });
    expect(parsed).toEqual({
      clientMoveId: '018f47f4-7b2f-4d90-8a66-8abcdef01234',
      expectedVersion: 0,
      uci: 'e2e4',
    });
  });
});
