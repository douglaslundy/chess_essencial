import { describe, expect, it } from 'vitest';

import { normalizeLessonDataset } from './lesson-importer.js';

const sourceHash = '5c04386a52193fb6f89b969731f307ac30c3ef08dd7ea9ebfec7a400e4c9662b';
const lesson = (overrides: Record<string, unknown> = {}) => ({
  estimatedMinutes: 8,
  module: 1,
  prerequisites: [],
  slug: 'test-lesson',
  sourcePages: [4, 5],
  steps: [
    {
      bodyMd: 'Observe the source position.',
      expectedActions: [],
      feedback: {},
      nextStepRules: [],
      stepKey: 'intro',
      stepType: 'text',
    },
    {
      bodyMd: 'Move the pawn from b2 to b3.',
      expectedActions: [{ type: 'move', uci: 'b2b3' }],
      feedback: { correct: 'Correct.', incorrect: 'Try again.' },
      initialFen: '4k3/8/8/8/8/8/1P6/4K3 w - - 0 1',
      nextStepRules: [],
      orientation: 'white',
      stepKey: 'board',
      stepType: 'board_instruction',
    },
    {
      bodyMd: 'Review the objective.',
      expectedActions: [],
      feedback: {},
      nextStepRules: [],
      stepKey: 'summary',
      stepType: 'summary',
    },
  ],
  title: 'Test lesson',
  ...overrides,
});

function dataset(content = lesson()) {
  return {
    lessons: [{ chapter: 1, exerciseNumbers: [1, 2], lesson: content }],
    schemaVersion: '1.0.0',
    source: { sha256: sourceHash },
    statistics: {
      boardLessons: 1,
      exerciseLinks: 2,
      lessonCount: 1,
      moduleCount: 1,
      stepCount: 3,
    },
  };
}

describe('normalizeLessonDataset', () => {
  it('accepts schema content and validates the expected board move', () => {
    const result = normalizeLessonDataset(dataset(), 'fixture.json');
    expect(result.statistics).toEqual({
      boardLessons: 1,
      exerciseLinks: 2,
      lessonCount: 1,
      moduleCount: 1,
      stepCount: 3,
    });
  });

  it('rejects a response activity without a board', () => {
    const invalid = lesson({
      steps: [
        lesson().steps[0],
        {
          bodyMd: 'Type done.',
          expectedActions: [{ type: 'answer', value: 'done' }],
          feedback: {},
          nextStepRules: [],
          stepKey: 'answer',
          stepType: 'quiz',
        },
        lesson().steps[2],
      ],
    });
    expect(() => normalizeLessonDataset(dataset(invalid), 'fixture.json')).toThrow(
      'every response activity requires a board',
    );
  });

  it('rejects an illegal expected board move', () => {
    const invalid = lesson({
      steps: [
        lesson().steps[0],
        { ...lesson().steps[1], expectedActions: [{ type: 'move', uci: 'b2b5' }] },
        lesson().steps[2],
      ],
    });
    expect(() => normalizeLessonDataset(dataset(invalid), 'fixture.json')).toThrow();
  });

  it('rejects prerequisites that are not present in the dataset', () => {
    expect(() =>
      normalizeLessonDataset(
        dataset(lesson({ prerequisites: ['missing-lesson'] })),
        'fixture.json',
      ),
    ).toThrow('unknown prerequisite');
  });
});
