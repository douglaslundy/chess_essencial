import { describe, expect, it } from 'vitest';

import { splitCoachText } from './coach-text';

describe('splitCoachText', () => {
  it('keeps a short message whole', () => {
    expect(splitCoachText('Bom lance. Continue assim!')).toEqual({
      lead: 'Bom lance. Continue assim!',
      rest: '',
    });
  });

  it('shows the first two sentences and leaves the rest for "ver mais"', () => {
    expect(splitCoachText('Primeira. Segunda!  Terceira?\nQuarta.')).toEqual({
      lead: 'Primeira. Segunda!',
      rest: 'Terceira? Quarta.',
    });
  });

  it('does not split on decimals', () => {
    expect(splitCoachText('Perdeu 1.5 peão. Depois. Fim.').lead).toBe('Perdeu 1.5 peão. Depois.');
  });

  it('cuts an overlong sentence at a word boundary with an ellipsis', () => {
    const long = `${'palavra '.repeat(60)}fim.`;
    const { lead, rest } = splitCoachText(long, 2, 50);
    expect(lead.endsWith('…')).toBe(true);
    expect(lead.length).toBeLessThanOrEqual(51);
    expect(`${lead.slice(0, -1)} ${rest}`).toBe(long.trim());
  });
});
