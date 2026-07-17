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
  it('imports the real collection shape as text and referenced diagrams', () => {
    const result = normalizeExerciseDataset(
      {
        diagrams: [
          {
            fen: 'diagram-data',
            id: 'diagram-001',
            legal_for_play: false,
            position_type: 'illustrative_board',
          },
        ],
        exercises: [
          {
            answer_format: 'free_text',
            chapter: 1,
            id: 'exercise-0001',
            module: 1,
            number: 1,
            prompt: 'Explain the concept.',
            solution: 'A reasoned answer.',
            tag: 'Concept',
          },
          {
            answer_format: 'free_text',
            chapter: 2,
            diagram_refs: ['diagram-001'],
            id: 'exercise-0002',
            module: 1,
            number: 2,
            positions: [{ diagram_id: 'diagram-001', fen: 'diagram-data' }],
            prompt: 'Read the diagram.',
            solution: 'The pattern.',
            tag: 'Application',
          },
        ],
        schema_version: '1.0.0',
      },
      'real-shape.json',
    );

    expect(result.report).toMatchObject({ imported: 2, rejected: 0, total: 2 });
    expect(result.exercises[0]).toMatchObject({
      answerFormat: 'free_text',
      category: 'Concept',
      externalId: 'exercise-0001',
      positionType: 'text_only',
    });
    expect(result.exercises[1]).toMatchObject({
      fen: 'diagram-data',
      positionType: 'illustrative_diagram',
    });
  });
});
