import type { OpeningLine } from '@xadrez/contracts';
import { describe, expect, it } from 'vitest';

import { pickVariations } from './variations';

const line = (name: string, plyCount: number, games: number): OpeningLine => ({
  eco: 'B00',
  family: 'Sicilian Defense',
  games,
  id: `${name}-${plyCount}`,
  moves: [],
  name,
  pgn: '',
  plyCount,
  side: 'black',
});

describe('pickVariations', () => {
  const lines = [
    line('Sicilian Defense', 2, 900),
    line('Sicilian Defense: Najdorf Variation', 10, 300),
    line('Sicilian Defense: Najdorf Variation, English Attack', 14, 120),
    line('Sicilian Defense: Dragon Variation', 12, 200),
    line('Sicilian Defense: Taimanov Variation', 8, 150),
    line('Sicilian Defense: Scheveningen Variation', 10, 100),
    line('Sicilian Defense: Classical Variation', 10, 90),
    line('Sicilian Defense: Kan Variation', 8, 80),
  ];

  it('takes the family line as the base and the 5 most played first-level variations', () => {
    const result = pickVariations(lines);
    expect(result.base?.name).toBe('Sicilian Defense');
    expect(result.main.map((item) => item.name)).toEqual([
      'Sicilian Defense: Najdorf Variation',
      'Sicilian Defense: Dragon Variation',
      'Sicilian Defense: Taimanov Variation',
      'Sicilian Defense: Scheveningen Variation',
      'Sicilian Defense: Classical Variation',
    ]);
  });

  it('keeps sub-variations and the less played ones in "others", most played first', () => {
    expect(pickVariations(lines).others.map((item) => item.name)).toEqual([
      'Sicilian Defense: Najdorf Variation, English Attack',
      'Sicilian Defense: Kan Variation',
    ]);
  });

  it('copes with an empty family', () => {
    expect(pickVariations([])).toEqual({ base: null, main: [], others: [] });
  });
});
