import { describe, expect, it } from 'vitest';

import {
  exerciseSearchQuerySchema,
  startExerciseTrainingInputSchema,
  submitExerciseAttemptInputSchema,
} from './exercise.js';

describe('exercise contracts', () => {
  it('normalizes search pagination and numeric filters', () => {
    expect(
      exerciseSearchQuerySchema.parse({ limit: '15', module: '2', offset: '5' }),
    ).toMatchObject({ limit: 15, module: 2, offset: 5 });
  });

  it('creates a bounded default training session', () => {
    expect(startExerciseTrainingInputSchema.parse({})).toEqual({
      filters: { limit: 10 },
    });
  });

  it('rejects empty or excessive attempt lines', () => {
    expect(() =>
      submitExerciseAttemptInputSchema.parse({ durationMs: 10, submittedLine: [] }),
    ).toThrow();
    expect(() =>
      submitExerciseAttemptInputSchema.parse({
        durationMs: 10,
        submittedLine: Array.from({ length: 51 }, () => 'e2e4'),
      }),
    ).toThrow();
  });
});
