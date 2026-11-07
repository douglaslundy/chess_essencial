import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Shape,
  SphereGeometry,
  Vector2,
  TorusGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import type { PieceKind } from './piece-geometry';

/**
 * Heights from the "Marfim" spec (pacote_xadrez_3d_marfim/config/visual-spec.json) times
 * IVORY_SCALE. The spec's ratios are kept (king > queen > bishop > knight > rook > pawn); the
 * scale makes the set read like the reference render, where the king stands ~1.5 squares tall.
 */
export const IVORY_SCALE = 1.6;
export const IVORY_HEIGHT: Record<PieceKind, number> = {
  b: 0.84 * IVORY_SCALE,
  k: 1.02 * IVORY_SCALE,
  n: 0.81 * IVORY_SCALE,
  p: 0.63 * IVORY_SCALE,
  q: 0.91 * IVORY_SCALE,
  r: 0.78 * IVORY_SCALE,
};

const SEGMENTS = 48;

type Profile = Array<[number, number]>;

function lathe(points: Profile): BufferGeometry {
  return new LatheGeometry(
    points.map(([x, y]) => new Vector2(x, y)),
    SEGMENTS,
  );
}

/** Weighted foot: bevelled plinth, cove and a turned bead, common to the whole set. */
function foot(radius: number): Profile {
  return [
    [0.001, 0],
    [radius * 0.96, 0],
    [radius, 0.025],
    [radius, 0.06],
    [radius * 0.94, 0.09],
    [radius * 0.84, 0.115],
    [radius * 0.72, 0.135],
    [radius * 0.74, 0.16],
    [radius * 0.8, 0.185],
    [radius * 0.74, 0.21],
  ];
}

function ball(radius: number, y: number, x = 0, z = 0): BufferGeometry {
  const sphere = new SphereGeometry(radius, 28, 18);
  sphere.translate(x, y, z);
  return sphere;
}

function ring(radius: number, tube: number, y: number): BufferGeometry {
  const torus = new TorusGeometry(radius, tube, 12, SEGMENTS);
  torus.rotateX(Math.PI / 2);
  torus.translate(0, y, 0);
  return torus;
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  return mergeGeometries(parts.map((part) => (part.index ? part.toNonIndexed() : part)))!;
}

function pawn(): BufferGeometry {
  const body = lathe([
    ...foot(0.33),
    [0.2, 0.27],
    [0.15, 0.34],
    [0.115, 0.46],
    [0.11, 0.52],
    [0.16, 0.55],
    [0.17, 0.58],
    [0.13, 0.6],
    [0.001, 0.6],
  ]);
  return merge([body, ball(0.175, 0.72)]);
}

function rook(): BufferGeometry {
  const body = lathe([
    ...foot(0.35),
    [0.25, 0.28],
    [0.2, 0.42],
    [0.185, 0.7],
    [0.2, 0.74],
    [0.31, 0.78],
    [0.33, 0.8],
    [0.33, 0.98],
    [0.26, 0.98],
    [0.26, 0.92],
    [0.001, 0.92],
  ]);
  const parts: BufferGeometry[] = [body, ring(0.2, 0.025, 0.27)];
  // Six merlons around the rim: crenellations with real gaps between them.
  for (let i = 0; i < 6; i += 1) {
    const merlon = new BoxGeometry(0.1, 0.17, 0.17);
    merlon.translate(0.27, 1.06, 0);
    merlon.rotateY((i * Math.PI) / 3);
    parts.push(merlon);
  }
  return merge(parts);
}

function bishop(): BufferGeometry {
  const body = lathe([
    ...foot(0.34),
    [0.24, 0.28],
    [0.16, 0.4],
    [0.125, 0.62],
    [0.12, 0.7],
    [0.2, 0.74],
    [0.21, 0.78],
    [0.15, 0.82],
    [0.2, 0.9],
    [0.22, 1.02],
    [0.2, 1.14],
    [0.14, 1.26],
    [0.07, 1.33],
    [0.001, 1.35],
  ]);
  return merge([body, ball(0.055, 1.4), ring(0.15, 0.022, 0.83)]);
}

/** Dark slit across the mitre: a thin box set into the front of the head, tilted ~40 degrees. */
function bishopSlit(): BufferGeometry {
  const slit = new BoxGeometry(0.05, 0.3, 0.05);
  slit.rotateZ(-Math.PI / 4.4);
  slit.translate(0.1, 1.14, 0);
  return slit;
}

function queen(): BufferGeometry {
  const body = lathe([
    ...foot(0.37),
    [0.27, 0.29],
    [0.17, 0.42],
    [0.135, 0.7],
    [0.13, 0.84],
    [0.24, 0.9],
    [0.26, 0.94],
    [0.2, 0.98],
    [0.17, 1.04],
    [0.23, 1.2],
    [0.27, 1.27],
    [0.2, 1.3],
    [0.001, 1.3],
  ]);
  const parts: BufferGeometry[] = [body, ring(0.135, 0.025, 0.78), ring(0.255, 0.026, 0.92)];
  // Coronet: eight points, each topped by a ball, around a central finial.
  for (let i = 0; i < 8; i += 1) {
    const angle = (i * Math.PI * 2) / 8;
    const spike = new CylinderGeometry(0.018, 0.05, 0.16, 10);
    spike.translate(0, 0.08, 0);
    spike.rotateZ(-0.22);
    spike.translate(0.235, 1.26, 0);
    spike.rotateY(angle);
    parts.push(spike);
    parts.push(ball(0.04, 1.44, Math.cos(angle) * 0.285, -Math.sin(angle) * 0.285));
  }
  parts.push(ball(0.085, 1.36));
  return merge(parts);
}

function king(): BufferGeometry {
  const body = lathe([
    ...foot(0.38),
    [0.28, 0.3],
    [0.18, 0.44],
    [0.14, 0.76],
    [0.135, 0.9],
    [0.25, 0.96],
    [0.27, 1.0],
    [0.21, 1.05],
    [0.18, 1.12],
    [0.25, 1.28],
    [0.28, 1.36],
    [0.2, 1.4],
    [0.001, 1.4],
  ]);
  // Cross with real depth: vertical beam and arms along the left-right axis (local Z).
  const vertical = new BoxGeometry(0.1, 0.44, 0.1);
  vertical.translate(0, 1.6, 0);
  const arms = new BoxGeometry(0.1, 0.1, 0.34);
  arms.translate(0, 1.67, 0);
  return merge([
    body,
    ring(0.14, 0.026, 0.84),
    ring(0.265, 0.028, 0.98),
    ball(0.075, 1.42),
    vertical,
    arms,
  ]);
}

/**
 * Horse head in profile, extruded with a rounded bevel: neck, mane, two ears, brow, muzzle and
 * chin. Faces local +X. The head tapers towards the muzzle so the back view is not a flat slab.
 */
function knight(): BufferGeometry {
  const plinth = lathe([...foot(0.35), [0.28, 0.3], [0.25, 0.34], [0.26, 0.38], [0.001, 0.38]]);
  const shape = new Shape();
  shape.moveTo(-0.24, 0.36);
  shape.bezierCurveTo(-0.28, 0.6, -0.2, 0.86, -0.1, 1.05); // back of the neck (mane)
  shape.lineTo(-0.12, 1.2); // rear ear
  shape.lineTo(-0.03, 1.14);
  shape.lineTo(0.0, 1.27); // fore ear
  shape.lineTo(0.09, 1.12);
  shape.bezierCurveTo(0.22, 1.06, 0.36, 0.92, 0.46, 0.78); // forehead to nose
  shape.lineTo(0.47, 0.7);
  shape.bezierCurveTo(0.44, 0.64, 0.36, 0.64, 0.3, 0.68); // muzzle underside
  shape.bezierCurveTo(0.24, 0.66, 0.2, 0.62, 0.22, 0.56); // chin
  shape.bezierCurveTo(0.16, 0.5, 0.2, 0.42, 0.24, 0.36); // throat
  shape.closePath();
  const head = new ExtrudeGeometry(shape, {
    bevelEnabled: true,
    bevelSegments: 5,
    bevelSize: 0.05,
    bevelThickness: 0.05,
    curveSegments: 20,
    depth: 0.18,
  });
  head.translate(0, 0, -0.09);
  const position = head.getAttribute('position');
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    const taper = 1 - Math.min(Math.max((y - 0.6) / 0.7, 0), 1) * 0.35;
    position.setZ(i, position.getZ(i) * taper);
  }
  position.needsUpdate = true;
  head.computeVertexNormals();
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
let slit: BufferGeometry | null = null;

/** Fits the geometry to its spec height; width grows half as much so bases stay 0.62-0.74 wide. */
export function ivoryGeometry(kind: PieceKind): BufferGeometry {
  let geometry = cache.get(kind);
  if (!geometry) {
    geometry = builders[kind]();
    geometry.computeBoundingBox();
    const grow = IVORY_HEIGHT[kind] / geometry.boundingBox!.max.y;
    const sideways = 1 + (grow - 1) / 2;
    geometry.scale(sideways, grow, sideways);
    geometry.computeVertexNormals();
    cache.set(kind, geometry);
  }
  return geometry;
}

/** The bishop's mitre slit, already in the bishop's scaled frame. */
export function ivoryBishopSlit(): BufferGeometry {
  if (!slit) {
    slit = bishopSlit();
    const grow = IVORY_HEIGHT.b / 1.4;
    slit.scale(1 + (grow - 1) / 2, grow, 1 + (grow - 1) / 2);
  }
  return slit;
}

/** Extra yaw (radians) so knights are seen three-quarters on from the default camera. */
export const IVORY_KNIGHT_YAW = (50 * Math.PI) / 180;
