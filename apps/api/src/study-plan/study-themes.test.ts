import { describe, expect, it } from 'vitest';

import { matchTags, pickThemes, type MoveStat } from './study-themes.js';

const move = (ply: number, quality: MoveStat['quality'], missedWin = false): MoveStat => ({
  color: ply % 2 === 1 ? 'white' : 'black',
  missedWin,
  ply,
  quality,
});

describe('pickThemes', () => {
  it('flags unsafe moves and missed wins of the player only', () => {
    const themes = pickThemes([move(1, 'gafe'), move(2, 'gafe'), move(3, 'bom', true)], 'white');
    expect(themes.slice(0, 2).map((theme) => theme.key)).toEqual(['safety', 'tactics']);
    expect(themes[0]!.reason).toContain('1 erro grave');
  });

  it('points to the phase where the mistakes piled up', () => {
    const endgame = [move(61, 'imprecisao'), move(63, 'erro'), move(65, 'imprecisao')];
    expect(pickThemes(endgame, 'white').map((theme) => theme.key)).toContain('endgame');
  });

  it('still suggests something for a clean game', () => {
    expect(pickThemes([move(1, 'otimo')], 'white')).toHaveLength(1);
  });
});

describe('matchTags', () => {
  it('matches registered tags ignoring case and separators, and nothing else', () => {
    const available = ['fork', 'mateIn2', 'hanging_piece', 'advantage'];
    expect(matchTags(['fork', 'garfo', 'hangingPiece', 'mateIn2'], available)).toEqual([
      'fork',
      'mateIn2',
      'hanging_piece',
    ]);
    expect(matchTags(['endgame'], available)).toEqual([]);
  });
});
