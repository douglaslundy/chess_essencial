import { describe, expect, it } from 'vitest';

import { normalizeExerciseDataset } from './exercise-importer.js';

describe('normalizeExerciseDataset', () => {
  it('normalizes Portuguese aliases and accepts a legal FEN', () => {
    const result = normalizeExerciseDataset(
      [
        {
          enunciado: 'Jogue.',
          fen: '8/8/8/8/8/8/4P3/4K2k w - - 0 1',
          numero: 1,
          paginas: [3, 4],
          solucao: 'e4',
        },
      ],
      'fixture.json',
    );

    expect(result.report).toMatchObject({ imported: 1, rejected: 0, total: 1 });
    expect(result.exercises[0]).toMatchObject({
      sideToMove: 'white',
      sourceNumber: 1,
      sourcePages: [3, 4],
    });
  });

  it('rejects an invalid legal FEN with an explicit reason', () => {
    const result = normalizeExerciseDataset(
      [{ fen: 'invalid', number: 2, prompt: 'Find the move.', solution: 'e4' }],
      'fixture.json',
    );

    expect(result.report).toMatchObject({
      imported: 0,
      reasons: { invalid_fen: 1 },
      rejected: 1,
    });
  });

  it('keeps illustrative diagrams outside legal-position validation', () => {
    const result = normalizeExerciseDataset(
      [
        {
          fen: 'diagram-data',
          illustrative: true,
          number: 3,
          prompt: 'Observe.',
          solution: 'Pattern',
        },
      ],
      'fixture.json',
    );

    expect(result.exercises[0]?.positionType).toBe('illustrative_diagram');
    expect(result.report.rejected).toBe(0);
  });

  it('counts malformed and incomplete entries independently', () => {
    const result = normalizeExerciseDataset(
      [
        null,
        { fen: 'startpos', number: 4, solution: 'e4' },
        { fen: 'startpos', number: 5, prompt: 'Move' },
      ],
      'fixture.json',
    );

    expect(result.report).toMatchObject({
      imported: 0,
      reasons: { invalid_item: 1, missing_prompt: 1, missing_solution: 1 },
      rejected: 3,
      total: 3,
    });
  });
});
