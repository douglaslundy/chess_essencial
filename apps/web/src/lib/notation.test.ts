import { describe, expect, it } from 'vitest';

import { formatUciSquares, toBrazilianSan } from './notation';

describe('toBrazilianSan', () => {
  it('translates each piece letter except the bishop', () => {
    expect(toBrazilianSan('Nf3')).toBe('Cf3');
    expect(toBrazilianSan('Qxe4')).toBe('Dxe4');
    expect(toBrazilianSan('Rae1')).toBe('Tae1');
    expect(toBrazilianSan('Bb5')).toBe('Bb5');
    expect(toBrazilianSan('Kg1')).toBe('Rg1');
  });

  it('leaves pawn moves untouched (no leading piece letter)', () => {
    expect(toBrazilianSan('e4')).toBe('e4');
    expect(toBrazilianSan('exd5')).toBe('exd5');
  });

  it('translates a promotion piece', () => {
    expect(toBrazilianSan('e8=Q')).toBe('e8=D');
    expect(toBrazilianSan('bxa1=N+')).toBe('bxa1=C+');
  });

  it('leaves castling untouched', () => {
    expect(toBrazilianSan('O-O')).toBe('O-O');
    expect(toBrazilianSan('O-O-O')).toBe('O-O-O');
  });

  it('preserves check and mate suffixes', () => {
    expect(toBrazilianSan('Qxe4+')).toBe('Dxe4+');
    expect(toBrazilianSan('Rd8#')).toBe('Td8#');
  });
});

describe('formatUciSquares', () => {
  it('splits a UCI move into a readable square pair', () => {
    expect(formatUciSquares('e2e4')).toBe('e2 → e4');
  });
});
