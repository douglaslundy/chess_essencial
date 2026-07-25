import { describe, expect, it } from 'vitest';

import {
  createBotGameInputSchema,
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
      botDifficulty: 'matched',
      fallbackToBot: false,
      playerColor: 'random',
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

  it('validates bot difficulty and player color preferences', () => {
    expect(
      createBotGameInputSchema.parse({
        botDifficulty: 'advanced',
        playerColor: 'black',
        timeControlCode: 'rapid-10-0',
      }),
    ).toEqual({
      botDifficulty: 'advanced',
      coachMode: false,
      playerColor: 'black',
      timeControlCode: 'rapid-10-0',
    });
    expect(() =>
      createBotGameInputSchema.parse({
        botDifficulty: 'impossible',
        timeControlCode: 'rapid-10-0',
      }),
    ).toThrow();
  });
});
