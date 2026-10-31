import { describe, expect, it } from 'vitest';

import { buildChunkPrompt, chunkEnd, parseChunkResponse } from './library-review-prompt.js';

const moves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'];
const header = {
  black: 'B',
  event: 'Teste',
  openingName: 'Ruy Lopez',
  playedOn: '1999',
  result: '1-0',
  white: 'A',
};

describe('library review prompt', () => {
  it('lists only the requested plies with the authoritative FEN before each', () => {
    const prompt = buildChunkPrompt(header, moves, 3);
    expect(prompt).toContain('ply 3 (Brancas) Nf3');
    expect(prompt).toContain('ply 6 (Pretas) a6');
    expect(prompt).not.toContain('ply 2 (Pretas)');
  });

  it('caps chunk end at the game length', () => {
    expect(chunkEnd(6, 1)).toBe(6);
    expect(chunkEnd(80, 11)).toBe(20);
  });

  it('keeps legal better moves and drops illegal or identical ones', () => {
    const raw = JSON.stringify([
      { better: 'Nc3', betterWhy: 'desenvolve', ply: 3, summary: 's', why: 'w' },
      { better: 'Qh9', betterWhy: 'x', ply: 4, summary: 's', why: 'w' },
      { better: 'Bb5', betterWhy: 'x', ply: 5, summary: 's', why: 'w' },
      { ply: 99, summary: 's', why: 'w' },
    ]);
    const entries = parseChunkResponse(`texto\n${raw}\nfim`, moves, 3, 6);
    expect(entries.map((entry) => entry.ply)).toEqual([3, 4, 5]);
    expect(entries[0]).toMatchObject({ better: 'Nc3', betterWhy: 'desenvolve' });
    expect(entries[1]).toMatchObject({ better: null, betterWhy: null });
    expect(entries[2]?.better).toBeNull();
  });
});
