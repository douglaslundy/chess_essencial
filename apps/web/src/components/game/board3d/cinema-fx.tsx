'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type MutableRefObject } from 'react';
import {
  AdditiveBlending,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  LatheGeometry,
  MeshStandardMaterial,
  ShaderMaterial,
  TubeGeometry,
  Vector2,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type PointLight,
} from 'three';

import { CINE_IMPACT, liveCine, span, victimState, type Cine } from './cinema-scenes';

const auraTime = { value: 0 };

/** Flame shell: noise scrolling upwards, cut into tongues that thin out towards the top. */
function auraMaterial(color: string, core: string) {
  return new ShaderMaterial({
    blending: AdditiveBlending,
    depthWrite: false,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform vec3 uCore;
      varying vec2 vUv;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
              mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
          mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
              mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
          f.z);
      }
      void main() {
        // The angle goes in as a circle so the flame has no seam.
        float a = vUv.x * 6.2831853;
        vec3 p = vec3(cos(a) * 1.6, sin(a) * 1.6, vUv.y * 3.0 - uTime * 2.6);
        float n = noise(p) * 0.65 + noise(p * 2.3 + 7.0) * 0.35;
        float h = vUv.y;
        float flame = smoothstep(h * 0.95, h * 0.95 + 0.35, n + 0.25 * (1.0 - h));
        float alpha = flame * (1.0 - h) * smoothstep(0.0, 0.08, h);
        gl_FragColor = vec4(mix(uColor, uCore, flame * (1.0 - h)), alpha * 0.6);
      }`,
    side: DoubleSide,
    transparent: true,
    uniforms: {
      uColor: { value: new Color(color) },
      uCore: { value: new Color(core) },
      uTime: auraTime,
    },
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.xz *= 1.0 + 0.06 * sin(uTime * 9.0 + position.y * 8.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
  });
}

let aura: { b: ShaderMaterial; geometry: LatheGeometry; w: ShaderMaterial } | null = null;
function auraAssets() {
  aura ??= {
    // Black pieces burn yellow, white pieces blue.
    b: auraMaterial('#ffb300', '#fff3a0'),
    geometry: new LatheGeometry(
      [
        [0.34, 0],
        [0.46, 0.25],
        [0.44, 0.6],
        [0.34, 1],
        [0.2, 1.4],
        [0.04, 1.85],
      ].map(([r, y]) => new Vector2(r, y)),
      32,
    ),
    w: auraMaterial('#1f7bff', '#bfe6ff'),
  };
  return aura;
}

/** Ki-style aura around a piece that attacks an enemy piece. `height` is the piece's height. */
export function KiAura({ color, height }: { color: 'w' | 'b'; height: number }) {
  const assets = auraAssets();
  useFrame((state) => {
    auraTime.value = state.clock.elapsedTime;
  });
  return (
    <mesh
      geometry={assets.geometry}
      material={assets[color]}
      renderOrder={2}
      scale={[1, height / 1.3, 1]}
    />
  );
}

const BOLTS = 8;
const SHARDS = 26;
const up = new Vector3(0, 1, 0);

/** A jagged bolt one unit long, from the origin up. */
function boltGeometry(seed: number) {
  const points = Array.from({ length: 9 }, (_, i) => {
    const jag = i === 0 || i === 8 ? 0 : 0.07;
    return new Vector3(
      Math.sin(seed * 13 + i * 7.3) * jag,
      i / 8,
      Math.cos(seed * 5 + i * 3.1) * jag,
    );
  });
  return new TubeGeometry(new CatmullRomCurve3(points, false, 'catmullrom', 0), 32, 0.012, 5);
}

const flicker = (t: number, i: number) =>
  Math.abs(Math.sin(Math.floor(t * 20) * 12.9898 + i * 78.233));

/** Effects of the capture scene running in `cine`: lightning, magic, fire and the shattered victim. */
export function CineFx({ cine }: { cine: MutableRefObject<Cine | null> }) {
  const root = useRef<Group>(null);
  const bolts = useRef<Group>(null);
  const shards = useRef<Group>(null);
  const bubble = useRef<Mesh>(null);
  const ring = useRef<Mesh>(null);
  const fireball = useRef<Mesh>(null);
  const flash = useRef<PointLight>(null);
  const geometries = useMemo(() => [boltGeometry(1), boltGeometry(2), boltGeometry(3)], []);
  const rays = useMemo(
    () =>
      Array.from({ length: BOLTS }, (_, i) => {
        const a = (i / BOLTS) * Math.PI * 2 + i;
        return new Vector3(Math.cos(a), Math.sin(i * 2.4) * 0.8, Math.sin(a)).normalize();
      }),
    [],
  );
  const velocities = useMemo(
    () =>
      Array.from({ length: SHARDS }, (_, i) => {
        const a = (i / SHARDS) * Math.PI * 2;
        const speed = 1.3 + ((i * 37) % 10) / 5;
        return new Vector3(Math.cos(a) * speed, 1 + ((i * 53) % 10) / 3, Math.sin(a) * speed);
      }),
    [],
  );

  // One material for every shard, recolored to the victim's stone.
  const shardMaterial = useMemo(() => new MeshStandardMaterial({ roughness: 0.5 }), []);

  useFrame(() => {
    const c = liveCine(cine.current);
    const node = root.current;
    if (!node) return;
    node.visible = c !== null;
    if (!c) return;
    const t = performance.now() / 1000 - c.at;
    const kind = c.attacker;
    const [x, z] = c.to;
    const y = victimState(kind, Math.min(t, CINE_IMPACT)).y + 0.6;
    const charge = span(t, 2.5, CINE_IMPACT);
    const blast = t >= CINE_IMPACT ? 1 - span(t, CINE_IMPACT, CINE_IMPACT + 0.5) : 0;
    let glow = blast * 45;
    let glowColor = '#fff1d0';

    // Queen: rays burst out of the victim. Bishop: lightning falls on it from the sky.
    const sky = kind === 'b';
    const boltsOn = (kind === 'q' || sky) && t > 2.5 && t < CINE_IMPACT + 0.1;
    let lit = false;
    bolts.current?.children.forEach((bolt, i) => {
      const on =
        boltsOn &&
        (sky ? i < 3 && Math.floor(t * 18) % 3 === i : flicker(t, i) < 0.2 + charge * 0.8);
      bolt.visible = on;
      if (!on) return;
      lit = true;
      if (sky) {
        bolt.position.set(x, 0.3, z);
        bolt.quaternion.identity();
        bolt.scale.set(5, 7, 5);
      } else {
        bolt.position.set(x, y, z);
        bolt.quaternion.setFromUnitVectors(up, rays[i]!);
        bolt.scale.set(1.6, 0.5 + charge * 1.3, 1.6);
      }
    });
    if (kind === 'q' && t < CINE_IMPACT) {
      glow += charge * 14;
      glowColor = '#b48cff';
    }
    if (sky && lit) {
      glow += 30;
      glowColor = '#cfe6ff';
    }

    if (bubble.current) {
      // Telekinesis: a shimmering hold around the lifted victim.
      const held = kind === 'q' && t > 1.9 && t < CINE_IMPACT;
      bubble.current.visible = held;
      bubble.current.position.set(x, y, z);
      bubble.current.scale.setScalar(0.75 + Math.sin(t * 9) * 0.04);
      (bubble.current.material as MeshBasicMaterial).opacity = 0.12 + charge * 0.22;
    }

    if (fireball.current) {
      // Rook: fire gathers on the battlements, then flies in an arc.
      const grow = span(t, 2, 2.6);
      const fly = span(t, 2.6, CINE_IMPACT);
      fireball.current.visible = kind === 'r' && grow > 0 && t < CINE_IMPACT;
      fireball.current.position.set(
        c.stage[0] + (x - c.stage[0]) * fly,
        1.2 + (0.6 - 1.2) * fly + Math.sin(Math.PI * fly) * 1.2,
        c.stage[1] + (z - c.stage[1]) * fly,
      );
      fireball.current.scale.setScalar(grow * (0.2 + Math.sin(t * 30) * 0.02));
      if (fireball.current.visible) {
        glow += grow * 12;
        glowColor = '#ff8a2b';
        flash.current?.position.copy(fireball.current.position);
      }
    }
    if (flash.current) {
      if (!(kind === 'r' && t < CINE_IMPACT)) flash.current.position.set(x, y + 0.3, z);
      flash.current.intensity = glow;
      flash.current.color.set(glowColor);
    }

    if (ring.current) {
      const wave = span(t, CINE_IMPACT, CINE_IMPACT + 0.6);
      ring.current.visible = kind !== 'q' && kind !== 'b' && wave > 0 && wave < 1;
      ring.current.position.set(x, 0.03, z);
      ring.current.scale.setScalar(0.3 + wave * 3.2);
      (ring.current.material as MeshBasicMaterial).opacity = 1 - wave;
    }

    if (shards.current) {
      const dt = t - CINE_IMPACT;
      shards.current.visible = dt > 0 && dt < 1.5;
      // Speared, the victim crumbles where it stands; every other power blasts it apart.
      const force = kind === 'p' ? 0.45 : 1;
      shards.current.children.forEach((shard, i) => {
        const v = velocities[i]!;
        const k = Math.max(dt, 0);
        shard.position.set(
          x + v.x * k * force,
          Math.max(y + v.y * k * force - 4.5 * k * k, 0.05),
          z + v.z * k * force,
        );
        shard.rotation.set(k * 7 + i, k * 5, k * 3);
        shard.scale.setScalar(Math.max(1 - k / 1.5, 0.001) * (0.6 + (i % 4) * 0.25));
      });
      shardMaterial.color.set(c.victimWhite ? '#e4dccb' : '#2b2b30');
    }
  });

  return (
    <group ref={root} visible={false}>
      <pointLight decay={1.5} distance={14} intensity={0} ref={flash} />
      <group ref={bolts}>
        {rays.map((_, i) => (
          <mesh geometry={geometries[i % 3]!} key={i} visible={false}>
            <meshBasicMaterial blending={AdditiveBlending} color="#d9c4ff" depthWrite={false} />
          </mesh>
        ))}
      </group>
      <mesh ref={bubble} visible={false}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color="#b48cff"
          depthWrite={false}
          transparent
        />
      </mesh>
      <mesh ref={fireball} visible={false}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshBasicMaterial color="#ffb347" />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.35, 0.5, 40]} />
        <meshBasicMaterial color="#e8d5a8" depthWrite={false} transparent />
      </mesh>
      <group ref={shards} visible={false}>
        {velocities.map((_, i) => (
          <mesh castShadow key={i} material={shardMaterial}>
            <tetrahedronGeometry args={[0.11]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
