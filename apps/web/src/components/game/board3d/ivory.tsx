'use client';

import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  CanvasTexture,
  ExtrudeGeometry,
  PMREMGenerator,
  RepeatWrapping,
  Shape,
  SRGBColorSpace,
  type Texture,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import { ivoryBishopSlit, ivoryGeometry } from './ivory-geometry';
import type { PieceKind } from './piece-geometry';

/** Colours and PBR values from the "Marfim" spec (config/visual-spec.json). */
export const IVORY_COLORS = {
  darkWood: '#805034',
  frame: '#593622',
  graphite: '#292a30',
  ivory: '#e8d8b9',
  lightWood: '#ddbb91',
};
const VARIANTS = 4;

/** Seeded so the grain is the same on every load (and in every test). */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** Wood grain: soft wavy streaks plus a few darker growth rings, tinted by `base`. */
function woodTexture(base: string, streak: string, seed: number, size = 256): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = random(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const phase = rand() * Math.PI * 2;
  for (let line = 0; line < 70; line += 1) {
    const y = rand() * size;
    const amplitude = 2 + rand() * 7;
    const wavelength = 60 + rand() * 120;
    ctx.strokeStyle = streak;
    ctx.globalAlpha = 0.04 + rand() * 0.1;
    ctx.lineWidth = 0.6 + rand() * 2.4;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 8) {
      const wave = Math.sin((x / wavelength) * Math.PI * 2 + phase + line) * amplitude;
      if (x === 0) ctx.moveTo(x, y + wave);
      else ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

export interface IvoryMaps {
  dark: Texture;
  darkAlt: Texture[];
  frame: Texture;
  light: Texture;
  lightAlt: Texture[];
  roughness: number;
}

/** Light maple-like and dark mahogany-like squares (4 variants each, so the board isn't tiled). */
export function useIvoryMaps(enabled: boolean): IvoryMaps | null {
  const maps = useMemo(() => {
    if (!enabled) return null;
    const lightAlt = Array.from({ length: VARIANTS }, (_, i) =>
      woodTexture(IVORY_COLORS.lightWood, '#8a6238', 11 + i * 7),
    );
    const darkAlt = Array.from({ length: VARIANTS }, (_, i) =>
      woodTexture(IVORY_COLORS.darkWood, '#2a1409', 101 + i * 13),
    );
    return {
      dark: darkAlt[0]!,
      darkAlt,
      frame: woodTexture(IVORY_COLORS.frame, '#1c0d05', 301, 512),
      light: lightAlt[0]!,
      lightAlt,
      roughness: 0.55,
    };
  }, [enabled]);
  useEffect(
    () => () => {
      if (maps) [maps.frame, ...maps.lightAlt, ...maps.darkAlt].forEach((t) => t.dispose());
    },
    [maps],
  );
  return maps;
}

function roundedSlab(size: number, radius: number, depth: number, bevel: number) {
  const half = size / 2;
  const shape = new Shape();
  shape.moveTo(-half + radius, -half);
  shape.lineTo(half - radius, -half);
  shape.quadraticCurveTo(half, -half, half, -half + radius);
  shape.lineTo(half, half - radius);
  shape.quadraticCurveTo(half, half, half - radius, half);
  shape.lineTo(-half + radius, half);
  shape.quadraticCurveTo(-half, half, -half, half - radius);
  shape.lineTo(-half, -half + radius);
  shape.quadraticCurveTo(-half, -half, -half + radius, -half);
  const geometry = new ExtrudeGeometry(shape, {
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: bevel,
    bevelThickness: bevel,
    depth,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/** Thick walnut frame with bevelled edges and a thin inlay line around the playing area. */
export function IvoryFrame({ maps }: { maps: IvoryMaps }) {
  const slab = useMemo(() => roundedSlab(9.3, 0.18, 0.34, 0.07), []);
  useEffect(() => () => slab.dispose(), [slab]);
  return (
    <group>
      {/* Top face ends just below the squares (y = 0). */}
      <mesh geometry={slab} position={[0, -0.5, 0]} receiveShadow>
        <meshStandardMaterial color="#ffffff" map={maps.frame} metalness={0} roughness={0.4} />
      </mesh>
      {[
        [0, -4.04, 8.12, 0.05],
        [0, 4.04, 8.12, 0.05],
        [-4.04, 0, 0.05, 8.12],
        [4.04, 0, 0.05, 8.12],
      ].map(([x, z, w, d]) => (
        <mesh key={`${x}${z}`} position={[x!, -0.004, z!]}>
          <boxGeometry args={[w!, 0.012, d!]} />
          <meshStandardMaterial color="#2b180d" roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

let shadowTexture: CanvasTexture | null = null;
/** Soft radial blob: a cheap contact shadow that anchors each base to the board. */
function contactShadowTexture() {
  if (shadowTexture) return shadowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(0,0,0,0.55)');
  gradient.addColorStop(0.6, 'rgba(0,0,0,0.22)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  shadowTexture = new CanvasTexture(canvas);
  return shadowTexture;
}

/** One turned piece: ivory or graphite satin, a contact shadow and (bishop) the mitre slit. */
export function IvoryPiece({ color, kind }: { color: 'w' | 'b'; kind: PieceKind }) {
  const geometry = useMemo(() => ivoryGeometry(kind), [kind]);
  const white = color === 'w';
  return (
    <group>
      <mesh
        position={[0, 0.006, 0]}
        raycast={() => undefined}
        renderOrder={-1}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[1.15, 1.15]} />
        <meshBasicMaterial
          depthWrite={false}
          map={contactShadowTexture()}
          opacity={0.9}
          toneMapped={false}
          transparent
        />
      </mesh>
      <mesh castShadow geometry={geometry} receiveShadow>
        <meshPhysicalMaterial
          clearcoat={0.18}
          clearcoatRoughness={0.45}
          color={white ? IVORY_COLORS.ivory : IVORY_COLORS.graphite}
          metalness={0}
          roughness={white ? 0.32 : 0.34}
          sheen={white ? 0.4 : 0.8}
          sheenColor={white ? '#fff3d6' : '#6b6e80'}
          sheenRoughness={0.6}
        />
      </mesh>
      {kind === 'b' ? (
        <mesh geometry={ivoryBishopSlit()}>
          <meshStandardMaterial color={white ? '#5c4a2c' : '#0b0b0d'} roughness={0.7} />
        </mesh>
      ) : null}
    </group>
  );
}

/** Soft studio light: warm key with soft shadow, cool rim behind and a low fill. */
export function IvoryLights({ coarse }: { coarse: boolean }) {
  return (
    <>
      <ambientLight intensity={0.12} />
      <hemisphereLight args={['#fff1da', '#3a2218', 0.5]} />
      <directionalLight
        castShadow
        color="#fff1d8"
        intensity={2.0}
        position={[4.5, 11, 7]}
        shadow-bias={-0.0004}
        shadow-camera-bottom={-7}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-mapSize={coarse ? [1024, 1024] : [2048, 2048]}
        shadow-normalBias={0.025}
        shadow-radius={coarse ? 3 : 5}
      />
      <directionalLight color="#bcd0ff" intensity={0.7} position={[-6, 5, -8]} />
      <directionalLight color="#ffe6c4" intensity={0.25} position={[-7, 6, 5]} />
    </>
  );
}

/** Image-based light from three's built-in studio room (no download), for soft reflections. */
export function IvoryEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    const previous = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    // eslint-disable-next-line react-hooks/immutability -- three.js scene is mutable by design
    scene.environment = target.texture;
    scene.environmentIntensity = 0.3;
    return () => {
      scene.environment = previous;
      scene.environmentIntensity = previousIntensity;
      target.dispose();
      room.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}
