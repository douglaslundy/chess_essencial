import { describe, expect, it } from 'vitest';

import { PIECE_HEIGHT, pieceGeometry, type PieceKind } from './piece-geometry';

const height = (kind: PieceKind) => {
  const geometry = pieceGeometry(kind);
  geometry.computeBoundingBox();
  return geometry.boundingBox!.max.y;
};

describe('3D piece sizes', () => {
  it('draws each piece at its set height: king tallest, queen second', () => {
    for (const kind of ['p', 'r', 'n', 'b', 'q', 'k'] as const) {
      expect(height(kind)).toBeCloseTo(PIECE_HEIGHT[kind], 2);
    }
    const order = (['k', 'q', 'b', 'n', 'r', 'p'] as const).map(height);
    expect([...order].sort((a, b) => b - a)).toEqual(order);
  });

  it('keeps the king well above the queen and inside its square', () => {
    expect(height('k') - height('q')).toBeGreaterThan(0.25);
    const king = pieceGeometry('k');
    king.computeBoundingBox();
    expect(king.boundingBox!.max.x - king.boundingBox!.min.x).toBeLessThan(0.95);
  });
});
