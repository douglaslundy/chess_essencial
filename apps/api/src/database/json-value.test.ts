import { describe, expect, it } from 'vitest';

import { jsonValue } from './json-value.js';

describe('jsonValue', () => {
  it('keeps arrays and objects as structured JSON values', () => {
    expect(jsonValue([{ type: 'move', uci: 'b2b3' }])).toEqual([{ type: 'move', uci: 'b2b3' }]);
    expect(jsonValue({ correct: true, optional: undefined })).toEqual({ correct: true });
  });
});
