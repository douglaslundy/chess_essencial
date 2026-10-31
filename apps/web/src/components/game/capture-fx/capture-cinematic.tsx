'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import type { PieceSymbol } from 'chess.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AdditiveBlending,
  CatmullRomCurve3,
  TubeGeometry,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type PointLight,
} from 'three';

import styles from './capture-cinematic.module.css';
import { playCaptureSound } from './capture-sound';
import { pieceGeometry } from '@/components/game/board3d/piece-geometry';
import type { PlayedMove } from '@/components/game/move-path';

// Timeline (seconds). The overlay never blocks the game: it is pointer-transparent and
// unmounts itself after TOTAL, so clocks and clicks keep running underneath.
const TOTAL = 3;
const APPROACH_END = 0.9;
const START_X = -2.6;
const CONTACT_X = -0.2;
const VICTIM_X = 0.9;
const IMPACT: Record<PieceSymbol, number> = { b: 1.45, k: 1.25, n: 1.3, p: 1.3, q: 1.45, r: 1.35 };

const PIECE_PT: Record<PieceSymbol, string> = {
  b: 'Bispo',
  k: 'Rei',
  n: 'Cavalo',
  p: 'Peão',
  q: 'Dama',
  r: 'Torre',
};
const POWER_PT: Record<PieceSymbol, string> = {
  b: 'raio sagrado',
  k: 'relâmpago real',
  n: 'pisoteio',
  p: 'golpe de espada',
  q: 'tempestade arcana',
  r: 'esmagamento',
};
const LIGHT = '#f1e7d0';
const DARK = '#5a5e72';
const FRAGMENTS = 22;

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
const smooth = (v: number) => v * v * (3 - 2 * v);
const span = (t: number, from: number, to: number) => clamp01((t - from) / (to - from));

function bolt(seed: number): TubeGeometry {
  const points: Vector3[] = [];
  let x = VICTIM_X - 0.6;
  for (let i = 0; i <= 8; i += 1) {
    const y = 6 - i * 0.72;
    x += Math.sin(seed * 13 + i * 7.3) * 0.28;
    points.push(new Vector3(i === 8 ? VICTIM_X : x, y, Math.cos(seed * 5 + i * 3.1) * 0.25));
  }
  return new TubeGeometry(new CatmullRomCurve3(points, false, 'catmullrom', 0), 48, 0.05, 6);
}

function Duel({ move }: { move: PlayedMove }) {
  const attackerType = move.piece;
  const victimType = move.captured ?? 'p';
  const impact = IMPACT[attackerType];
  const attacker = useRef<Group>(null);
  const victim = useRef<Group>(null);
  const sword = useRef<Group>(null);
  const beam = useRef<Mesh>(null);
  const ring = useRef<Mesh>(null);
  const orbs = useRef<Group>(null);
  const bolts = useRef<Group>(null);
  const shards = useRef<Group>(null);
  const flash = useRef<PointLight>(null);
  const start = useRef(-1);
  const attackerGeometry = useMemo(() => pieceGeometry(attackerType), [attackerType]);
  const victimGeometry = useMemo(() => pieceGeometry(victimType), [victimType]);
  const boltGeometries = useMemo(() => [bolt(1), bolt(2), bolt(3)], []);
  const velocities = useMemo(
    () =>
      Array.from({ length: FRAGMENTS }, (_, i) => {
        const angle = (i / FRAGMENTS) * Math.PI * 2;
        const speed = 1.2 + ((i * 37) % 10) / 6;
        return new Vector3(
          Math.cos(angle) * speed,
          1.5 + ((i * 53) % 10) / 4,
          Math.sin(angle) * speed,
        );
      }),
    [],
  );
  const attackerColor = move.color === 'w' ? LIGHT : DARK;
  const victimColor = move.color === 'w' ? DARK : LIGHT;

  useEffect(() => {
    playCaptureSound(attackerType, APPROACH_END, impact);
  }, [attackerType, impact]);

  useFrame((state) => {
    if (start.current < 0) start.current = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - start.current;

    // 360° orbit around the duel.
    const angle = -0.6 + Math.PI * 2 * smooth(clamp01(t / TOTAL));
    state.camera.position.set(Math.sin(angle) * 5.2 - 0.3, 2.6, Math.cos(angle) * 5.2);
    state.camera.lookAt(-0.3, 0.6, 0);

    const a = attacker.current;
    if (a) {
      // Approach: three hops towards the victim.
      const walk = span(t, 0, APPROACH_END);
      let x = START_X + (CONTACT_X - START_X) * smooth(walk);
      let y = walk < 1 ? Math.abs(Math.sin(walk * Math.PI * 3)) * 0.25 : 0;
      let tilt = 0;
      const attack = span(t, APPROACH_END, impact);
      if (attackerType === 'r') {
        // Leaps high and crashes onto the victim.
        x = t < APPROACH_END ? x : CONTACT_X + (VICTIM_X - CONTACT_X) * attack;
        if (t >= APPROACH_END && t < impact) y = Math.sin(attack * Math.PI) * 2.4;
      } else if (attackerType === 'n') {
        // Rears up, then stomps.
        tilt = t < impact ? Math.sin(attack * Math.PI * 0.5) * 0.7 : 0;
        if (t >= impact) tilt = 0;
        if (t >= APPROACH_END && t < impact) y = attack * 0.5;
      } else if (attackerType === 'b' || attackerType === 'k') {
        if (t >= APPROACH_END) y = Math.sin(Math.min(attack, 1) * Math.PI * 0.5) * 0.3;
      }
      a.position.set(x, y, 0);
      a.rotation.set(0, Math.PI / 2, tilt);
    }

    const v = victim.current;
    if (v) {
      const tremble = t > APPROACH_END && t < impact ? Math.sin(t * 60) * 0.03 : 0;
      v.position.set(VICTIM_X + tremble, 0, 0);
      v.visible = t < impact;
    }

    if (sword.current) {
      const raise = span(t, APPROACH_END - 0.1, APPROACH_END + 0.15);
      const thrust = span(t, APPROACH_END + 0.2, impact);
      const fade = 1 - span(t, impact + 0.2, impact + 0.6);
      sword.current.visible = attackerType === 'p' && raise > 0 && fade > 0;
      sword.current.position.set(CONTACT_X + 0.2 + thrust * 0.75, 0.55, 0);
      sword.current.scale.setScalar(raise * fade);
    }

    if (beam.current) {
      const grow = span(t, APPROACH_END, impact);
      const fade = 1 - span(t, impact + 0.1, impact + 0.6);
      beam.current.visible = attackerType === 'b' && grow > 0 && fade > 0;
      beam.current.scale.set(
        0.3 + grow * 0.7 + (1 - fade) * 0.8,
        1,
        0.3 + grow * 0.7 + (1 - fade) * 0.8,
      );
      (beam.current.material as MeshBasicMaterial).opacity = grow * fade * 0.75;
    }

    if (ring.current) {
      const wave = span(t, impact, impact + 0.55);
      ring.current.visible = (attackerType === 'n' || attackerType === 'r') && wave > 0 && wave < 1;
      ring.current.scale.setScalar(0.2 + wave * 3);
      (ring.current.material as MeshBasicMaterial).opacity = 1 - wave;
    }

    if (orbs.current) {
      const u = span(t, APPROACH_END, impact);
      orbs.current.visible = attackerType === 'q' && u > 0 && u < 1;
      orbs.current.children.forEach((orb, i) => {
        const theta = (i / 5) * Math.PI * 2 + u * 12;
        const radius = 0.8 * (1 - u);
        orb.position.set(
          CONTACT_X + (VICTIM_X - CONTACT_X) * u + Math.cos(theta) * radius,
          1.2 - u * 0.6 + Math.sin(theta) * radius * 0.5,
          Math.sin(theta) * radius,
        );
      });
    }

    if (bolts.current) {
      const on = attackerType === 'k' && t > APPROACH_END + 0.05 && t < impact + 0.3;
      const pick = Math.floor(t / 0.05) % 3;
      bolts.current.children.forEach((child, i) => (child.visible = on && i === pick));
    }

    if (flash.current) {
      const glow = span(t, impact - 0.05, impact) * (1 - span(t, impact, impact + 0.5));
      flash.current.intensity = glow * 30;
    }

    if (shards.current) {
      const dt = t - impact;
      shards.current.visible = dt > 0;
      // The bishop's light dissolves the victim upwards; every other power blasts it apart.
      const gravity = attackerType === 'b' ? -1.5 : 9;
      shards.current.children.forEach((shard, i) => {
        const vel = velocities[i]!;
        const k = Math.max(dt, 0);
        shard.position.set(
          VICTIM_X + vel.x * k * 0.8,
          Math.max(0.5 + vel.y * k - 0.5 * gravity * k * k, 0.05),
          vel.z * k * 0.8,
        );
        shard.rotation.set(k * 7 + i, k * 5, k * 3);
        shard.scale.setScalar(Math.max(1 - k / 1.4, 0.001));
      });
    }
  });

  const squares = [];
  for (let file = -3; file <= 2; file += 1)
    for (let rank = -1; rank <= 1; rank += 1)
      squares.push(
        <mesh
          key={`${file}:${rank}`}
          position={[file + 0.4, 0, rank]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[1, 1]} />
          <meshStandardMaterial color={(file + rank) % 2 === 0 ? '#8f6340' : '#ead7ae'} />
        </mesh>,
      );

  return (
    <>
      <color args={['#100d0b']} attach="background" />
      <fog args={['#100d0b', 6, 14]} attach="fog" />
      <ambientLight intensity={0.6} />
      <directionalLight intensity={1.6} position={[3, 6, 4]} />
      <directionalLight intensity={0.7} position={[-4, 5, -3]} />
      <pointLight color="#ffd27a" intensity={0} position={[VICTIM_X, 1.2, 0.4]} ref={flash} />
      {squares}
      <group ref={attacker}>
        <mesh geometry={attackerGeometry}>
          <meshStandardMaterial color={attackerColor} metalness={0.3} roughness={0.35} />
        </mesh>
      </group>
      <group ref={victim} rotation={[0, -Math.PI / 2, 0]}>
        <mesh geometry={victimGeometry}>
          <meshStandardMaterial color={victimColor} metalness={0.3} roughness={0.35} />
        </mesh>
      </group>
      <group ref={sword} visible={false}>
        <mesh position={[0.35, 0, 0]}>
          <boxGeometry args={[0.7, 0.05, 0.12]} />
          <meshStandardMaterial color="#dfe6ee" metalness={0.9} roughness={0.15} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.06, 0.08, 0.36]} />
          <meshStandardMaterial color="#c9a24a" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[-0.12, 0, 0]}>
          <boxGeometry args={[0.18, 0.06, 0.06]} />
          <meshStandardMaterial color="#5a3a1c" />
        </mesh>
      </group>
      <mesh position={[VICTIM_X, 4, 0]} ref={beam} visible={false}>
        <cylinderGeometry args={[0.45, 0.45, 8, 24, 1, true]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color="#fff2b0"
          depthWrite={false}
          transparent
        />
      </mesh>
      <mesh
        position={[VICTIM_X, 0.03, 0]}
        ref={ring}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
      >
        <ringGeometry args={[0.35, 0.5, 40]} />
        <meshBasicMaterial color="#e8d5a8" depthWrite={false} transparent />
      </mesh>
      <group ref={orbs} visible={false}>
        {Array.from({ length: 5 }, (_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.11, 16, 16]} />
            <meshBasicMaterial blending={AdditiveBlending} color="#b48cff" />
          </mesh>
        ))}
      </group>
      <group ref={bolts}>
        {boltGeometries.map((geometry, i) => (
          <mesh geometry={geometry} key={i} visible={false}>
            <meshBasicMaterial blending={AdditiveBlending} color="#cfe6ff" />
          </mesh>
        ))}
      </group>
      <group ref={shards} visible={false}>
        {velocities.map((_, i) => (
          <mesh key={i}>
            <tetrahedronGeometry args={[0.13]} />
            <meshStandardMaterial color={victimColor} metalness={0.3} roughness={0.4} />
          </mesh>
        ))}
      </group>
    </>
  );
}

/** Non-modal capture cinematic: a floating window over the board that fades out by itself. */
export default function CaptureCinematic({ move }: { move: PlayedMove }) {
  const [visible, setVisible] = useState(true);
  const reduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), TOTAL * 1000);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible || reduced || !move.captured) return null;
  const caption = `${PIECE_PT[move.piece]} captura ${PIECE_PT[move.captured].toLowerCase()} · ${POWER_PT[move.piece]}`;
  return (
    <div className={styles.overlay}>
      <div className={styles.window}>
        <Canvas camera={{ far: 40, fov: 40, near: 0.1, position: [0, 2.6, 5.2] }} dpr={[1, 2]}>
          <Duel move={move} />
        </Canvas>
        <p className={styles.caption} role="status">
          {caption}
        </p>
      </div>
    </div>
  );
}
