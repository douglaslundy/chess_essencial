'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CanvasTexture,
  CylinderGeometry,
  LatheGeometry,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
  type Mesh,
  type Texture,
} from 'three';

type Kind = 'k' | 'q' | 'r' | 'b' | 'n' | 'p';

/**
 * Photographed angles of each carved piece (degrees). 0 = seen from the front, 90 = from the
 * piece's right side (it faces the viewer's right), 180 = from behind. Both colors share the poses;
 * files live at /pieces/medieval/<color><kind>/<angle>.webp.
 */
export const MEDIEVAL_VIEWS: Record<Kind, number[]> = {
  b: [0, 20, 150, 180, 240, 280, 300, 340],
  k: [0, 15, 40, 135, 180, 225, 290, 340],
  n: [0, 45, 70, 135, 180, 225, 290, 320],
  p: [0, 70, 150, 180, 210, 290, 330, 345],
  q: [0, 40, 135, 180, 225, 270, 320, 340],
  r: [0, 30, 90, 135, 180, 225, 270, 330],
};

/** Statue height in board units (one square = 1), from the photographed set's proportions. */
const MEDIEVAL_HEIGHT: Record<Kind, number> = {
  b: 1.28,
  k: 1.38,
  n: 1.1,
  p: 0.88,
  q: 1.3,
  r: 1.05,
};

export function medievalViewUrl(color: 'w' | 'b', kind: Kind, angle: number) {
  return `/pieces/medieval/${color}${kind}/${String(angle).padStart(3, '0')}.webp`;
}

/** The photographed angle closest to `degrees`; keeps `current` unless another is clearly closer. */
export function nearestView(views: number[], degrees: number, current?: number) {
  const gap = (a: number) => {
    const d = Math.abs((((a - degrees) % 360) + 360) % 360);
    return Math.min(d, 360 - d);
  };
  let best = views[0]!;
  for (const view of views) if (gap(view) < gap(best)) best = view;
  // Hysteresis: avoids flickering between two photos while the camera sits between them.
  return current !== undefined && views.includes(current) && gap(current) - gap(best) < 6
    ? current
    : best;
}

interface Entry {
  map: Texture;
  ready: boolean;
  waiters: Set<() => void>;
}
const textures = new Map<string, Entry>();
const loader = typeof window === 'undefined' ? null : new TextureLoader();

/** Shared, lazily loaded photo; `onReady` runs once it can be drawn (at once when cached). */
function texture(url: string, onReady: () => void) {
  let entry = textures.get(url);
  if (!entry) {
    const created: Entry = { map: null as unknown as Texture, ready: false, waiters: new Set() };
    created.map = loader!.load(url, () => {
      created.ready = true;
      created.waiters.forEach((waiter) => waiter());
      created.waiters.clear();
    });
    created.map.colorSpace = SRGBColorSpace;
    created.map.anisotropy = 4;
    textures.set(url, created);
    entry = created;
  }
  if (entry.ready) onReady();
  else entry.waiters.add(onReady);
  return entry.map;
}

/**
 * Where the carved pedestal ends in each photo (fraction of the photo height) and its width
 * (fraction of the photo height). The pedestal is rebuilt as a real cylinder wrapped in the photo's
 * own gothic band, so the piece stands on its square; the photo shows only the figure above it.
 */
const PEDESTAL: Record<Kind, { cut: number; width: number }> = {
  b: { cut: 0.18, width: 0.359 },
  k: { cut: 0.19, width: 0.363 },
  n: { cut: 0.2, width: 0.424 },
  p: { cut: 0.21, width: 0.48 },
  q: { cut: 0.19, width: 0.373 },
  r: { cut: 0.21, width: 0.494 },
};

const worldPos = new Vector3();
const cameraDir = new Vector3();
const parentQuat = new Quaternion();
const yawQuat = new Quaternion();
const UP = new Vector3(0, 1, 0);

/** Plane showing only the photo above the pedestal (v from `cut` to 1). */
function figureGeometry(width: number, height: number, cut: number) {
  const geometry = new PlaneGeometry(width, height);
  const uv = geometry.attributes.uv!;
  for (let i = 0; i < uv.count; i += 1) uv.setY(i, cut + uv.getY(i) * (1 - cut));
  return geometry;
}

/**
 * Pedestal side: the front photo's pedestal band wrapped around the cylinder, mirrored on the back
 * half so the gothic arches run all the way round.
 */
function pedestalGeometry(radius: number, height: number, cut: number, bandWidth: number) {
  const geometry = new CylinderGeometry(radius * 0.94, radius, height, 48, 1, true);
  const uv = geometry.attributes.uv!;
  for (let i = 0; i < uv.count; i += 1) {
    const around = Math.abs(((uv.getX(i) * 2) % 2) - 1);
    uv.setXY(i, 0.5 - bandWidth / 2 + around * bandWidth, uv.getY(i) * cut);
  }
  return geometry;
}

let contactShadow: CanvasTexture | null = null;
/** Soft dark blot under each piece: the cue that makes it rest on the board. */
function contactShadowTexture() {
  if (contactShadow || typeof document === 'undefined') return contactShadow;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 18, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(0,0,0,0.75)');
  gradient.addColorStop(0.55, 'rgba(0,0,0,0.35)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  contactShadow = new CanvasTexture(canvas);
  return contactShadow;
}

/**
 * A carved statue: a real pedestal standing on the square, topped by the photo of the figure
 * from the angle nearest to the camera. All figures turn with the camera's heading (parallel to
 * each other, upright), so the set reads as one row of statues instead of cards facing a point.
 */
export function MedievalStatue({ color, kind }: { color: 'w' | 'b'; kind: Kind }) {
  const figure = useRef<Mesh>(null);
  const views = MEDIEVAL_VIEWS[kind];
  const [angle, setAngle] = useState(() => views[0]!);
  const [, setLoaded] = useState(0);
  const height = MEDIEVAL_HEIGHT[kind];
  const { cut, width: pedestalWidth } = PEDESTAL[kind];
  const map = useMemo(
    () => texture(medievalViewUrl(color, kind, angle), () => setLoaded((n) => n + 1)),
    [angle, color, kind],
  );
  const front0 = useMemo(
    () => texture(medievalViewUrl(color, kind, 0), () => setLoaded((n) => n + 1)),
    [color, kind],
  );
  const image = map.image as { width?: number; height?: number } | undefined;
  const frontImage = front0.image as { width?: number; height?: number } | undefined;
  const width = image?.width && image.height ? (height * image.width) / image.height : height * 0.4;
  const radius = (pedestalWidth * height) / 2;
  const pedestalHeight = cut * height;
  const figureHeight = height - pedestalHeight;
  const figureGeom = useMemo(
    () => figureGeometry(width, figureHeight, cut),
    [cut, figureHeight, width],
  );
  const bandWidth =
    frontImage?.width && frontImage.height
      ? Math.min(0.92, ((pedestalWidth * frontImage.height) / frontImage.width) * 0.9)
      : 0.9;
  const pedestalGeom = useMemo(
    () => pedestalGeometry(radius, pedestalHeight, cut, bandWidth),
    [bandWidth, cut, pedestalHeight, radius],
  );
  // Pieces face the opponent, as on a real board.
  const front = color === 'w' ? -1 : 1;

  useEffect(() => {
    // Warm the other angles so turning the board never shows a blank piece.
    for (const view of views) texture(medievalViewUrl(color, kind, view), () => undefined);
  }, [color, kind, views]);

  useEffect(
    () => () => {
      figureGeom.dispose();
      pedestalGeom.dispose();
    },
    [figureGeom, pedestalGeom],
  );

  useFrame(({ camera }) => {
    const node = figure.current;
    if (!node?.parent) return;
    node.parent.getWorldPosition(worldPos);
    const dx = camera.position.x - worldPos.x;
    const dz = camera.position.z - worldPos.z;
    // Front is (0, 0, front) and the piece's right side (-front, 0, 0).
    const degrees = (Math.atan2(-front * dx, front * dz) * 180) / Math.PI;
    const next = nearestView(views, (degrees + 360) % 360, angle);
    if (next !== angle) setAngle(next);
    camera.getWorldDirection(cameraDir);
    node.parent.getWorldQuaternion(parentQuat);
    yawQuat.setFromAxisAngle(UP, Math.atan2(-cameraDir.x, -cameraDir.z));
    node.quaternion.copy(parentQuat.invert().multiply(yawQuat));
  });

  const ready = Boolean(image?.width && frontImage?.width);
  const stone = color === 'w' ? '#e4dccb' : '#26262a';
  return (
    <group visible={ready}>
      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius * 1.35, 32]} />
        <meshBasicMaterial depthWrite={false} map={contactShadowTexture()} transparent />
      </mesh>
      <mesh castShadow geometry={pedestalGeom} position={[0, pedestalHeight / 2, 0]} receiveShadow>
        <meshStandardMaterial map={front0} roughness={color === 'w' ? 0.6 : 0.35} />
      </mesh>
      <mesh position={[0, pedestalHeight, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius * 0.94, 48]} />
        <meshStandardMaterial color={stone} roughness={0.75} />
      </mesh>
      <mesh
        castShadow
        geometry={figureGeom}
        position={[0, pedestalHeight + figureHeight / 2, 0]}
        ref={figure}
      >
        <meshBasicMaterial alphaTest={0.5} alphaToCoverage map={map} toneMapped={false} />
      </mesh>
    </group>
  );
}

/**
 * Rook outline traced from its front photo: [height, radius], both as fractions of the photo
 * height. Merlons stand above `ROOK_MERLONS_FROM`.
 */
const ROOK_PROFILE: Array<[number, number]> = [
  [0, 0.2],
  [0.02, 0.235],
  [0.04, 0.247],
  [0.1, 0.245],
  [0.12, 0.229],
  [0.2, 0.22],
  [0.25, 0.221],
  [0.26, 0.201],
  [0.29, 0.2],
  [0.31, 0.17],
  [0.34, 0.166],
  [0.52, 0.162],
  [0.56, 0.15],
  [0.58, 0.14],
  [0.79, 0.137],
  [0.82, 0.157],
  [0.85, 0.186],
  [0.95, 0.184],
];
const ROOK_MERLONS_FROM = 0.95;
const ROOK_MERLONS = 8;

/** Lathe of the rook outline with the front photo wrapped round it, mirrored like the pedestals. */
function towerGeometry(height: number, aspect: number) {
  const geometry = new LatheGeometry(
    ROOK_PROFILE.map(([y, r]) => new Vector2(r * height, y * height)),
    48,
  );
  const uv = geometry.attributes.uv!;
  const position = geometry.attributes.position!;
  for (let i = 0; i < uv.count; i += 1) {
    const r = Math.hypot(position.getX(i), position.getZ(i)) / height;
    const around = Math.abs(((uv.getX(i) * 2) % 2) - 1);
    // Each ring samples only its own row's width of the photo, so the edges never reach past it.
    const band = Math.min(0.96, ((2 * r) / aspect) * 0.92);
    uv.setXY(i, 0.5 - band / 2 + around * band, position.getY(i) / height);
  }
  return geometry;
}

/**
 * The rook is a solid of revolution, so it is turned in 3D from its photo instead of shown as a
 * flat cut-out: the cut-out's straight walls carried the photo's own perspective and the tower
 * looked tilted on its pedestal.
 */
export function MedievalTower({ color }: { color: 'w' | 'b' }) {
  const [, setLoaded] = useState(0);
  const height = MEDIEVAL_HEIGHT.r;
  const map = useMemo(
    () => texture(medievalViewUrl(color, 'r', 0), () => setLoaded((n) => n + 1)),
    [color],
  );
  const image = map.image as { width?: number; height?: number } | undefined;
  const aspect = image?.width && image.height ? image.width / image.height : 0.5;
  const geometry = useMemo(() => towerGeometry(height, aspect), [aspect, height]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const stone = color === 'w' ? '#e4dccb' : '#26262a';
  const roughness = color === 'w' ? 0.6 : 0.35;
  const [, rimRadius] = ROOK_PROFILE[ROOK_PROFILE.length - 1]!;
  const rim = rimRadius * height;
  const merlonHeight = (1 - ROOK_MERLONS_FROM) * height;
  const merlonWidth = ((2 * Math.PI * rim) / ROOK_MERLONS) * 0.55;
  return (
    <group visible={Boolean(image?.width)}>
      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[ROOK_PROFILE[2]![1] * height * 1.35, 32]} />
        <meshBasicMaterial depthWrite={false} map={contactShadowTexture()} transparent />
      </mesh>
      {/* Turned so the photo's front (the arched window) faces the players. */}
      <mesh castShadow geometry={geometry} receiveShadow rotation={[0, Math.PI / 2, 0]}>
        <meshStandardMaterial map={map} roughness={roughness} />
      </mesh>
      <mesh
        position={[0, ROOK_MERLONS_FROM * height, 0]}
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[rim, 48]} />
        <meshStandardMaterial color={stone} roughness={0.75} />
      </mesh>
      {Array.from({ length: ROOK_MERLONS }, (_, i) => {
        const a = (i / ROOK_MERLONS) * Math.PI * 2;
        return (
          <mesh
            castShadow
            key={i}
            position={[
              Math.sin(a) * rim * 0.9,
              ROOK_MERLONS_FROM * height + merlonHeight / 2,
              Math.cos(a) * rim * 0.9,
            ]}
            receiveShadow
            rotation={[0, a, 0]}
          >
            <boxGeometry args={[merlonWidth, merlonHeight, rim * 0.22]} />
            <meshStandardMaterial color={stone} roughness={roughness} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Seeded value noise painted on a canvas: stone and wood grain without image files. */
function grainTexture(base: string, vein: string, wood: boolean, seed: number) {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  ctx.strokeStyle = vein;
  for (let i = 0; i < (wood ? 46 : 22); i += 1) {
    ctx.globalAlpha = 0.08 + rand() * 0.18;
    ctx.lineWidth = 0.6 + rand() * (wood ? 2.2 : 1.4);
    ctx.beginPath();
    let x = wood ? rand() * size : 0;
    let y = wood ? 0 : rand() * size;
    ctx.moveTo(x, y);
    for (let k = 0; k < 12; k += 1) {
      if (wood) {
        y += size / 12;
        x += (rand() - 0.5) * 9;
      } else {
        x += size / 12;
        y += (rand() - 0.5) * 30;
      }
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 900; i += 1) {
    ctx.globalAlpha = rand() * 0.07;
    ctx.fillStyle = rand() > 0.5 ? '#000' : '#fff';
    ctx.fillRect(rand() * size, rand() * size, 2, 2);
  }
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.wrapS = map.wrapT = RepeatWrapping;
  return map;
}

export function useMedievalMaterials() {
  return useMemo(
    () => ({
      dark: grainTexture('#4e3524', '#24160d', true, 7),
      frame: grainTexture('#3a2516', '#1b0f07', true, 3),
      light: grainTexture('#9e957f', '#6f6858', false, 11),
      stone: grainTexture('#77726a', '#3d3a36', false, 5),
    }),
    [],
  );
}

/** Oak frame with a carved stone inlay and a small turret on each corner. */
export function MedievalFrame({ maps }: { maps: ReturnType<typeof useMedievalMaterials> }) {
  const corners: Array<[number, number]> = [
    [-4.45, -4.45],
    [4.45, -4.45],
    [-4.45, 4.45],
    [4.45, 4.45],
  ];
  return (
    <group>
      <mesh position={[0, -0.32, 0]} receiveShadow>
        <boxGeometry args={[9.6, 0.6, 9.6]} />
        <meshStandardMaterial color="#6b4a33" map={maps.frame} roughness={0.75} />
      </mesh>
      <mesh position={[0, -0.045, 0]} receiveShadow>
        <boxGeometry args={[8.5, 0.08, 8.5]} />
        <meshStandardMaterial color="#8a847c" map={maps.stone} roughness={0.9} />
      </mesh>
      {corners.map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0, z]}>
          <mesh castShadow position={[0, 0.2, 0]} receiveShadow>
            <cylinderGeometry args={[0.28, 0.33, 0.5, 14]} />
            <meshStandardMaterial color="#9a948a" map={maps.stone} roughness={0.9} />
          </mesh>
          {/* Crenellations: four merlons around the turret top. */}
          {[0, 1, 2, 3].map((i) => (
            <mesh
              castShadow
              key={i}
              position={[
                Math.cos((i * Math.PI) / 2) * 0.22,
                0.52,
                Math.sin((i * Math.PI) / 2) * 0.22,
              ]}
              rotation={[0, (-i * Math.PI) / 2, 0]}
            >
              <boxGeometry args={[0.12, 0.14, 0.16]} />
              <meshStandardMaterial color="#9a948a" map={maps.stone} roughness={0.9} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
