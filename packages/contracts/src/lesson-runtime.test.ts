import { describe, expect, it } from 'vitest';

import {
  lessonActionInputSchema,
  lessonAttemptViewSchema,
  publicLessonStepSchema,
} from './lesson-runtime.js';

describe('lesson runtime contracts', () => {
  it('normalizes moves and rejects malformed actions', () => {
    expect(lessonActionInputSchema.parse({ type: 'move', uci: 'B2B3' })).toEqual({
      type: 'move',
      uci: 'b2b3',
    });
    expect(() => lessonActionInputSchema.parse({ type: 'move', uci: 'b2b9' })).toThrow();
  });

  it('keeps expected answers out of the public step contract', () => {
    const step = publicLessonStepSchema.parse({
      bodyMd: 'Mova o peão.',
      expectedActions: [{ type: 'move', uci: 'b2b3' }],
      initialFen: null,
      orientation: 'white',
      stepKey: 'move',
      stepType: 'board_instruction',
      title: null,
    });
    expect(step).not.toHaveProperty('expectedActions');
  });

  it('represents completed attempts without a future step', () => {
    expect(
      lessonAttemptViewSchema.parse({
        attemptId: '018f47f4-7b2f-4d90-8a66-8abcdef01234',
        currentStep: null,
        feedback: null,
        lessonId: '018f47f4-7b2f-4d90-8a66-9abcdef01234',
        progress: { completedSteps: 5, totalSteps: 5 },
        score: 100,
        status: 'completed',
        updatedAt: '2026-07-17T10:00:00.000Z',
      }).status,
    ).toBe('completed');
  });
});
