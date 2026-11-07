import { describe, expect, it } from 'vitest';

import { IVORY_HEIGHT, ivoryBishopSlit, ivoryGeometry } from './ivory-geometry';
import type { PieceKind } from './piece-geometry';

const KINDS: PieceKind[] = ['k', 'q', 'b', 'n', 'r', 'p'];

function size(kind: PieceKind) {
  const geometry = ivoryGeometry(kind);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  return { height: box.max.y, width: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) };
}

describe('ivory piece geometry', () => {
  it('builds six distinct, real 3D meshes', () => {
    const counts = KINDS.map((kind) => ivoryGeometry(kind).getAttribute('position').count);
    expect(new Set(counts).size).toBe(6);
    for (const count of counts) expect(count).toBeGreaterThan(500);
  });

  it('follows the spec height order: king > queen > bishop > knight > rook > pawn', () => {
    const heights = KINDS.map((kind) => size(kind).height);
    for (let i = 1; i < heights.length; i += 1) expect(heights[i]!).toBeLessThan(heights[i - 1]!);
    for (const kind of KINDS) expect(size(kind).height).toBeCloseTo(IVORY_HEIGHT[kind], 2);
  });

  it('makes the king at least 10% taller than the queen', () => {
    expect(size('k').height / size('q').height).toBeGreaterThanOrEqual(1.1);
  });

  it('keeps every base inside its square without overlapping the neighbours', () => {
    for (const kind of KINDS) {
      const { width } = size(kind);
      expect(width).toBeGreaterThanOrEqual(0.6);
      expect(width).toBeLessThanOrEqual(0.9);
    }
  });

  it('puts the bishop slit on the mitre, inside the bishop height', () => {
    const slit = ivoryBishopSlit();
    slit.computeBoundingBox();
    expect(slit.boundingBox!.max.y).toBeLessThan(IVORY_HEIGHT.b);
    expect(slit.boundingBox!.min.y).toBeGreaterThan(IVORY_HEIGHT.b * 0.5);
  });

  it('reuses one geometry per kind for both colours', () => {
    expect(ivoryGeometry('n')).toBe(ivoryGeometry('n'));
  });
});
