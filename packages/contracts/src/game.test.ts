import { describe, expect, it } from 'vitest';

import {
  createGameInputSchema,
  gameHistoryQuerySchema,
  reviewAnnotationInputSchema,
  submitMoveInputSchema,
} from './game.js';

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

  it('normalizes history pagination and rated filter', () => {
    expect(gameHistoryQuerySchema.parse({ page: '2', rated: 'false' })).toMatchObject({
      limit: 20,
      page: 2,
      rated: false,
    });
  });

  it('validates review arrows, highlights and defaults', () => {
    expect(
      reviewAnnotationInputSchema.parse({
        arrows: [{ from: 'e2', to: 'e4' }],
        highlights: [{ square: 'e4' }],
        ply: 1,
      }),
    ).toEqual({
      arrows: [{ color: 'gold', from: 'e2', to: 'e4' }],
      comment: null,
      highlights: [{ color: 'gold', square: 'e4' }],
      ply: 1,
    });
    expect(() =>
      reviewAnnotationInputSchema.parse({ arrows: [], highlights: [{ square: 'z9' }], ply: 1 }),
    ).toThrow();
  });
});
