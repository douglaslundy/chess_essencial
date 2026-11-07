import {
  BoxGeometry,
  BufferGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  SphereGeometry,
  Shape,
  Vector2,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type PieceKind = 'p' | 'r' | 'n' | 'b' | 'q' | 'k';

/**
 * Piece height (board units; one square = 1), as in a real set: the king clearly tallest, the
 * queen second, then bishop, knight, rook and pawn. `pieceGeometry` scales each model to this.
 */
export const PIECE_HEIGHT: Record<PieceKind, number> = {
  b: 1.2,
  k: 1.75,
  n: 1.08,
  p: 0.82,
  q: 1.45,
  r: 0.95,
};

const SEGMENTS = 28;

function lathe(points: Array<[number, number]>): BufferGeometry {
  return new LatheGeometry(
    points.map(([x, y]) => new Vector2(x, y)),
    SEGMENTS,
  );
}

/** Wide round plinth shared by every piece so they all feel like one carved set. */
function base(radius: number): Array<[number, number]> {
  return [
    [0.001, 0],
    [radius, 0],
    [radius, 0.05],
    [radius * 0.92, 0.1],
    [radius * 0.78, 0.14],
    [radius * 0.78, 0.18],
  ];
}

function pawn(): BufferGeometry {
  const body = lathe([
    ...base(0.32),
    [0.2, 0.24],
    [0.13, 0.42],
    [0.12, 0.5],
    [0.2, 0.54],
    [0.2, 0.58],
    [0.001, 0.58],
  ]);
  const head = new SphereGeometry(0.15, SEGMENTS, 16);
  head.translate(0, 0.68, 0);
  return merge([body, head]);
}

function rook(): BufferGeometry {
  const body = lathe([
    ...base(0.34),
    [0.24, 0.24],
    [0.2, 0.55],
    [0.2, 0.6],
    [0.3, 0.66],
    [0.3, 0.82],
    [0.001, 0.82],
  ]);
  const crenels: BufferGeometry[] = [body];
  for (let i = 0; i < 4; i += 1) {
    const block = new BoxGeometry(0.14, 0.12, 0.14);
    const angle = (i * Math.PI) / 2 + Math.PI / 4;
    block.translate(Math.cos(angle) * 0.2, 0.88, Math.sin(angle) * 0.2);
    crenels.push(block);
  }
  return merge(crenels);
}

function bishop(): BufferGeometry {
  const body = lathe([
    ...base(0.32),
    [0.2, 0.24],
    [0.12, 0.45],
    [0.11, 0.55],
    [0.22, 0.6],
    [0.22, 0.64],
    [0.14, 0.72],
    [0.17, 0.85],
    [0.1, 1.0],
    [0.001, 1.04],
  ]);
  const tip = new SphereGeometry(0.06, 16, 12);
  tip.translate(0, 1.1, 0);
  return merge([body, tip]);
}

function queen(): BufferGeometry {
  const body = lathe([
    ...base(0.36),
    [0.24, 0.26],
    [0.14, 0.55],
    [0.12, 0.7],
    [0.26, 0.78],
    [0.26, 0.84],
    [0.17, 0.92],
    [0.22, 1.08],
    [0.001, 1.08],
  ]);
  const parts: BufferGeometry[] = [body];
  for (let i = 0; i < 8; i += 1) {
    const bead = new SphereGeometry(0.055, 12, 10);
    const angle = (i * Math.PI * 2) / 8;
    bead.translate(Math.cos(angle) * 0.2, 1.12, Math.sin(angle) * 0.2);
    parts.push(bead);
  }
  const top = new SphereGeometry(0.09, 16, 12);
  top.translate(0, 1.26, 0);
  parts.push(top);
  return merge(parts);
}

function king(): BufferGeometry {
  const body = lathe([
    ...base(0.37),
    [0.25, 0.26],
    [0.15, 0.58],
    [0.13, 0.72],
    [0.27, 0.8],
    [0.27, 0.86],
    [0.2, 0.95],
    [0.24, 1.1],
    [0.001, 1.1],
  ]);
  const stem = new BoxGeometry(0.1, 0.34, 0.1);
  stem.translate(0, 1.27, 0);
  const arm = new BoxGeometry(0.28, 0.1, 0.1);
  arm.translate(0, 1.28, 0);
  return merge([body, stem, arm]);
}

function knight(): BufferGeometry {
  const plinth = lathe([...base(0.34), [0.26, 0.26], [0.22, 0.3], [0.001, 0.3]]);
  // Side profile of the horse head/neck, extruded and rounded with a bevel.
  const shape = new Shape();
  shape.moveTo(-0.22, 0.28);
  shape.bezierCurveTo(-0.24, 0.55, -0.12, 0.75, 0.0, 0.92);
  shape.lineTo(-0.02, 1.02);
  shape.lineTo(0.12, 0.98);
  shape.bezierCurveTo(0.26, 0.9, 0.38, 0.72, 0.4, 0.66);
  shape.lineTo(0.32, 0.6);
  shape.lineTo(0.24, 0.66);
  shape.bezierCurveTo(0.14, 0.62, 0.1, 0.5, 0.16, 0.28);
  shape.closePath();
  const head = new ExtrudeGeometry(shape, {
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.04,
    bevelThickness: 0.04,
    depth: 0.2,
  });
  head.translate(0, 0, -0.1);
  return merge([plinth, head]);
}

const builders: Record<PieceKind, () => BufferGeometry> = {
  b: bishop,
  k: king,
  n: knight,
  p: pawn,
  q: queen,
  r: rook,
};

const cache = new Map<PieceKind, BufferGeometry>();

export function pieceGeometry(kind: PieceKind): BufferGeometry {
  let geometry = cache.get(kind);
  if (!geometry) {
    geometry = builders[kind]();
    // Taller pieces grow wider only half as much, so the big king still fits its square.
    geometry.computeBoundingBox();
    const height = geometry.boundingBox!.max.y;
    const grow = PIECE_HEIGHT[kind] / height;
    const sideways = 1 + (grow - 1) / 2;
    geometry.scale(sideways, grow, sideways);
    geometry.computeVertexNormals();
    cache.set(kind, geometry);
  }
  return geometry;
}

// mergeGeometries needs every part indexed or every part non-indexed; the parts mix both.
function merge(parts: BufferGeometry[]): BufferGeometry {
  return mergeGeometries(parts.map((part) => (part.index ? part.toNonIndexed() : part)))!;
}
