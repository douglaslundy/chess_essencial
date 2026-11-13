import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { captureVideoSrc } from './capture-video';

describe('captureVideoSrc', () => {
  it('has a film for every capture: 2 colours x 6 attackers x 5 victims', () => {
    for (const color of ['w', 'b'] as const) {
      for (const piece of ['k', 'q', 'r', 'b', 'n', 'p'] as const) {
        for (const captured of ['q', 'r', 'b', 'n', 'p'] as const) {
          const src = captureVideoSrc({ captured, color, piece });
          expect(existsSync(join(process.cwd(), 'public', src)), src).toBe(true);
        }
      }
    }
  });
});
