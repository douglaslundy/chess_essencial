import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { jsonbArray } from './games.repository.js';

describe('jsonbArray', () => {
  it('keeps real arrays and decodes the legacy JSON string form', () => {
    expect(jsonbArray([{ ply: 1 }])).toEqual([{ ply: 1 }]);
    expect(jsonbArray('[{"ply":1}]')).toEqual([{ ply: 1 }]);
  });

  it('falls back to an empty list for null, garbage or non-array JSON', () => {
    expect(jsonbArray(null)).toEqual([]);
    expect(jsonbArray('{oops')).toEqual([]);
    expect(jsonbArray('{"a":1}')).toEqual([]);
  });
});
