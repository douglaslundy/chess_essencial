import { describe, expect, it } from 'vitest';

import { toBrazilianNotation, withBrazilianNotation } from './brazilian-notation.js';

describe('toBrazilianNotation', () => {
  it('translates piece letters of quoted SAN moves', () => {
    expect(toBrazilianNotation('Após Kf1 e Qxd5+, as brancas jogam Nbd2 e Rae1.')).toBe(
      'Após Rf1 e Dxd5+, as brancas jogam Cbd2 e Tae1.',
    );
    expect(toBrazilianNotation('O peão vai a e8=Q.')).toBe('O peão vai a e8=D.');
  });

  it('keeps bishops, pawn moves, castling and plain words', () => {
    expect(toBrazilianNotation('Bxe5, d4, O-O e o Rei fica seguro.')).toBe(
      'Bxe5, d4, O-O e o Rei fica seguro.',
    );
  });

  it('converts free-text fields but leaves the SAN in better', () => {
    const entry = withBrazilianNotation({
      better: 'Kf1',
      betterWhy: 'Kf1 protege',
      expect: null,
      ply: 1,
      strength: null,
      summary: 'Qh5 ataca',
      weakness: null,
      why: 'Nf3 desenvolve',
    });
    expect(entry).toMatchObject({
      better: 'Kf1',
      betterWhy: 'Rf1 protege',
      summary: 'Dh5 ataca',
      why: 'Cf3 desenvolve',
    });
  });
});
