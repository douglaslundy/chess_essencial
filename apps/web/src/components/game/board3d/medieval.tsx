'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CanvasTexture,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
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

const worldPos = new Vector3();
const parentQuat = new Quaternion();
const yawQuat = new Quaternion();
const UP = new Vector3(0, 1, 0);

/**
 * A carved statue: the photo of the angle nearest to the camera, standing upright and turned to
 * face the camera (around the vertical axis only, so it stays planted on its square).
 */
export function MedievalStatue({ color, kind }: { color: 'w' | 'b'; kind: Kind }) {
  const mesh = useRef<Mesh>(null);
  const views = MEDIEVAL_VIEWS[kind];
  const [angle, setAngle] = useState(() => views[0]!);
  const [, setLoaded] = useState(0);
  const height = MEDIEVAL_HEIGHT[kind];
  const map = useMemo(
    () => texture(medievalViewUrl(color, kind, angle), () => setLoaded((n) => n + 1)),
    [angle, color, kind],
  );
  const image = map.image as { width?: number; height?: number } | undefined;
  const width = image?.width && image.height ? (height * image.width) / image.height : height * 0.4;
  // Pieces face the opponent, as on a real board.
  const front = color === 'w' ? -1 : 1;

  useEffect(() => {
    // Warm the other angles so turning the board never shows a blank piece.
    for (const view of views) texture(medievalViewUrl(color, kind, view), () => undefined);
  }, [color, kind, views]);

  useFrame(({ camera }) => {
    const node = mesh.current;
    if (!node?.parent) return;
    node.parent.getWorldPosition(worldPos);
    const dx = camera.position.x - worldPos.x;
    const dz = camera.position.z - worldPos.z;
    // Front is (0, 0, front) and the piece's right side (-front, 0, 0).
    const degrees = (Math.atan2(-front * dx, front * dz) * 180) / Math.PI;
    const next = nearestView(views, (degrees + 360) % 360, angle);
    if (next !== angle) setAngle(next);
    node.parent.getWorldQuaternion(parentQuat);
    yawQuat.setFromAxisAngle(UP, Math.atan2(dx, dz));
    node.quaternion.copy(parentQuat.invert().multiply(yawQuat));
  });

  return (
    <mesh castShadow position={[0, height / 2, 0]} ref={mesh} visible={Boolean(image?.width)}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial alphaTest={0.5} alphaToCoverage map={map} toneMapped={false} />
    </mesh>
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
