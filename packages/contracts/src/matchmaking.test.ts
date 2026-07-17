import { describe, expect, it } from 'vitest';

import {
  createChallengeInputSchema,
  joinQueueInputSchema,
  timeControlCodeSchema,
} from './matchmaking.js';

describe('matchmaking contracts', () => {
  it('accepts only the versioned time control codes', () => {
    expect(timeControlCodeSchema.parse('rapid-10-0')).toBe('rapid-10-0');
    expect(() => timeControlCodeSchema.parse('rapid_10_0')).toThrow();
  });

  it('uses the same code contract for queues and direct challenges', () => {
    expect(joinQueueInputSchema.parse({ timeControlCode: 'blitz-3-2' })).toEqual({
      timeControlCode: 'blitz-3-2',
    });
    expect(
      createChallengeInputSchema.parse({
        challengedUserId: '00000000-0000-4000-8000-000000000001',
        timeControlCode: 'classical-30-0',
      }),
    ).toMatchObject({
      timeControlCode: 'classical-30-0',
      challengerColor: null,
    });
  });
});
