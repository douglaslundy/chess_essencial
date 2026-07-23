import { describe, expect, it } from 'vitest';

import { courseProgressSchema, interactiveLessonSchema, saveLessonInputSchema } from './course.js';

const lesson = {
  estimatedMinutes: 8,
  module: 1,
  prerequisites: [],
  slug: 'conhecendo-o-tabuleiro',
  sourcePages: [10, 11],
  steps: [
    {
      bodyMd: 'Identifique as casas do tabuleiro.',
      stepKey: 'introducao',
      stepType: 'text',
    },
  ],
  title: 'Conhecendo o tabuleiro',
};

describe('course contracts', () => {
  it('accepts a versioned lesson with source pages', () => {
    expect(saveLessonInputSchema.parse({ expectedVersion: 0, lesson })).toMatchObject({
      expectedVersion: 0,
      lesson: { sourcePages: [10, 11], steps: [{ expectedActions: [] }] },
    });
  });

  it('rejects duplicate step keys and self prerequisites', () => {
    expect(() =>
      interactiveLessonSchema.parse({
        ...lesson,
        prerequisites: [lesson.slug],
        steps: [lesson.steps[0], lesson.steps[0]],
      }),
    ).toThrow();
  });

  it('requires at least one source page', () => {
    expect(() => interactiveLessonSchema.parse({ ...lesson, sourcePages: [] })).toThrow();
  });

  it('validates a list of completed lesson ids', () => {
    const uuid = '11111111-1111-4111-8111-111111111111';
    expect(courseProgressSchema.parse({ completedLessonIds: [uuid] })).toEqual({
      completedLessonIds: [uuid],
    });
  });
});
