'use client';

import { useFrame } from '@react-three/fiber';
import { useRef, type MutableRefObject, type ReactNode } from 'react';
import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Group,
} from 'three';

import type { Pose } from './cinema-scenes';

/**
 * Figures of the "Medieval Cinema" board: stone statues assembled from simple solids, with
 * shoulders, elbows and waist that move, so a capture scene can pose them. Built facing +z and
 * turned to the board's convention (front = +x) by the outer group.
 */
type Kind = 'k' | 'q' | 'b' | 'n' | 'p';
type V3 = [number, number, number];

/** Same heights as the photographed medieval set, so both boards read alike. */
const HEIGHT: Record<Kind, number> = { b: 1.28, k: 1.38, n: 1.1, p: 0.88, q: 1.3 };
/** Height of the person as modelled below, crown included. */
const MODEL_HEIGHT = 1.36;

const unit = {
  box: new BoxGeometry(1, 1, 1),
  cone: new ConeGeometry(1, 1, 16),
  cylinder: new CylinderGeometry(1, 1, 1, 20),
  dome: new SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  // Narrow at the top: robes, chests, necks.
  taper: new CylinderGeometry(0.5, 1, 1, 20),
  sphere: new SphereGeometry(1, 20, 14),
  torus: new TorusGeometry(1, 0.25, 8, 20, Math.PI * 1.5),
};

const stone = {
  b: new MeshStandardMaterial({ color: '#2b2b30', metalness: 0.15, roughness: 0.38 }),
  w: new MeshStandardMaterial({ color: '#e4dccb', roughness: 0.6 }),
};
const gold = new MeshStandardMaterial({ color: '#c9a24a', metalness: 0.75, roughness: 0.3 });
const steel = new MeshStandardMaterial({ color: '#cfd6de', metalness: 0.9, roughness: 0.2 });

function Part({
  g,
  m,
  p = [0, 0, 0],
  r = [0, 0, 0],
  s,
}: {
  g: BufferGeometry;
  m: MeshStandardMaterial;
  p?: V3;
  r?: V3;
  s: V3 | number;
}) {
  return (
    <mesh castShadow geometry={g} material={m} position={p} receiveShadow rotation={r} scale={s} />
  );
}

function Pedestal({ m }: { m: MeshStandardMaterial }) {
  return (
    <>
      <Part g={unit.cylinder} m={m} p={[0, 0.06, 0]} s={[0.32, 0.12, 0.32]} />
      <Part g={unit.cylinder} m={m} p={[0, 0.145, 0]} s={[0.26, 0.05, 0.26]} />
    </>
  );
}

function Crown({ cross, y }: { cross?: boolean; y: number }) {
  return (
    <group position={[0, y, 0]}>
      <Part g={unit.cylinder} m={gold} p={[0, 0.03, 0]} s={[0.095, 0.06, 0.095]} />
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return (
          <Part
            g={unit.cone}
            key={i}
            m={gold}
            p={[Math.cos(a) * 0.085, 0.085, Math.sin(a) * 0.085]}
            s={[0.022, 0.06, 0.022]}
          />
        );
      })}
      {cross ? (
        <>
          <Part g={unit.box} m={gold} p={[0, 0.14, 0]} s={[0.025, 0.14, 0.025]} />
          <Part g={unit.box} m={gold} p={[0, 0.16, 0]} s={[0.09, 0.025, 0.025]} />
        </>
      ) : null}
    </group>
  );
}

/** Held with the tip along the arm (down, at rest); `grip` in the pose swings it. */
function Weapon({ kind }: { kind: Kind }) {
  if (kind === 'k') {
    return (
      <>
        <Part g={unit.box} m={steel} p={[0, -0.3, 0]} s={[0.045, 0.5, 0.014]} />
        <Part g={unit.box} m={gold} p={[0, -0.04, 0]} s={[0.16, 0.026, 0.03]} />
        <Part g={unit.cylinder} m={gold} p={[0, 0.04, 0]} s={[0.016, 0.12, 0.016]} />
      </>
    );
  }
  return (
    <>
      <Part g={unit.cylinder} m={gold} p={[0, -0.15, 0]} s={[0.014, 1.3, 0.014]} />
      {kind === 'b' ? (
        <Part g={unit.torus} m={gold} p={[0, -0.85, 0.05]} r={[0, Math.PI / 2, 0]} s={0.06} />
      ) : (
        <Part
          g={unit.cone}
          m={steel}
          p={[0, -0.87, 0]}
          r={[Math.PI, 0, 0]}
          s={[0.035, 0.15, 0.035]}
        />
      )}
    </>
  );
}

function Arm({
  children,
  elbow,
  m,
  shoulder,
  x,
}: {
  children?: ReactNode;
  elbow: MutableRefObject<Group | null>;
  m: MeshStandardMaterial;
  shoulder: MutableRefObject<Group | null>;
  x: number;
}) {
  return (
    <group position={[x, 0.28, 0]} rotation={[0, 0, x > 0 ? 0.1 : -0.1]}>
      <Part g={unit.sphere} m={m} s={0.075} />
      <group ref={shoulder}>
        <Part g={unit.cylinder} m={m} p={[0, -0.1, 0]} s={[0.04, 0.2, 0.04]} />
        <group position={[0, -0.2, 0]} ref={elbow}>
          <Part g={unit.cylinder} m={m} p={[0, -0.09, 0]} s={[0.035, 0.18, 0.035]} />
          <Part g={unit.sphere} m={m} p={[0, -0.2, 0]} s={0.045} />
          {children}
        </group>
      </group>
    </group>
  );
}

function Person({
  color,
  kind,
  pose,
}: {
  color: 'w' | 'b';
  kind: Kind;
  pose: MutableRefObject<Pose>;
}) {
  const m = stone[color];
  const torso = useRef<Group>(null);
  const shoulderL = useRef<Group>(null);
  const shoulderR = useRef<Group>(null);
  const elbowL = useRef<Group>(null);
  const elbowR = useRef<Group>(null);
  const weapon = useRef<Group>(null);
  const applied = useRef<Pose | null>(null);

  useFrame(() => {
    const p = pose.current;
    if (applied.current === p) return;
    applied.current = p;
    // Negative x-rotation swings an arm forward and up; positive leans the torso forward.
    if (torso.current) torso.current.rotation.x = p.bow;
    if (shoulderL.current) shoulderL.current.rotation.x = -p.armL;
    if (shoulderR.current) shoulderR.current.rotation.x = -p.armR;
    if (elbowL.current) elbowL.current.rotation.x = -p.elbowL;
    if (elbowR.current) elbowR.current.rotation.x = -p.elbowR;
    if (weapon.current) weapon.current.rotation.x = -p.grip;
  });

  const queen = kind === 'q';
  const skirt = queen ? 0.28 : kind === 'p' ? 0.2 : 0.24;
  return (
    <group scale={HEIGHT[kind] / MODEL_HEIGHT}>
      <Pedestal m={m} />
      <Part g={unit.taper} m={m} p={[0, 0.445, 0]} s={[skirt, 0.55, skirt]} />
      <group position={[0, 0.72, 0]} ref={torso}>
        <Part
          g={unit.taper}
          m={m}
          p={[0, 0.15, 0]}
          r={[Math.PI, 0, 0]}
          s={[queen ? 0.135 : 0.15, 0.3, 0.11]}
        />
        <Part g={unit.cylinder} m={m} p={[0, 0.33, 0]} s={[0.045, 0.08, 0.045]} />
        <Part g={unit.sphere} m={m} p={[0, 0.44, 0]} s={[0.09, 0.1, 0.095]} />
        {queen ? (
          <>
            {/* Hair falling down the back. */}
            <Part g={unit.sphere} m={m} p={[0, 0.43, -0.04]} s={[0.1, 0.11, 0.1]} />
            <Part g={unit.taper} m={m} p={[0, 0.25, -0.1]} s={[0.1, 0.36, 0.06]} />
            <Crown y={0.51} />
          </>
        ) : null}
        {kind === 'k' ? (
          <>
            <Part
              g={unit.cone}
              m={m}
              p={[0, 0.36, 0.06]}
              r={[Math.PI, 0, 0]}
              s={[0.06, 0.12, 0.04]}
            />
            <Part g={unit.cylinder} m={m} p={[0, 0.27, 0]} s={[0.2, 0.07, 0.15]} />
            {/* Cloak. */}
            <Part g={unit.taper} m={m} p={[0, -0.12, -0.11]} s={[0.22, 0.78, 0.07]} />
            <Crown cross y={0.52} />
          </>
        ) : null}
        {kind === 'b' ? (
          <>
            <Part g={unit.cone} m={m} p={[0, 0.63, 0]} s={[0.09, 0.22, 0.06]} />
            <Part g={unit.cylinder} m={gold} p={[0, 0.53, 0]} s={[0.092, 0.025, 0.07]} />
          </>
        ) : null}
        {kind === 'p' ? (
          <>
            <Part g={unit.dome} m={steel} p={[0, 0.46, 0]} s={[0.105, 0.11, 0.11]} />
            <Part g={unit.cylinder} m={steel} p={[0, 0.46, 0]} s={[0.125, 0.012, 0.13]} />
          </>
        ) : null}
        <Arm elbow={elbowL} m={m} shoulder={shoulderL} x={-0.185}>
          {kind === 'p' ? (
            <Part
              g={unit.cylinder}
              m={steel}
              p={[-0.05, -0.1, 0.03]}
              r={[0, 0, Math.PI / 2]}
              s={[0.14, 0.02, 0.14]}
            />
          ) : null}
        </Arm>
        <Arm elbow={elbowR} m={m} shoulder={shoulderR} x={0.185}>
          {queen ? null : (
            <group position={[0, -0.2, 0]} ref={weapon}>
              <Weapon kind={kind} />
            </group>
          )}
        </Arm>
      </group>
    </group>
  );
}

/** The knight: a whole horse that pivots on its hind hooves to rear. */
function Horse({ color, pose }: { color: 'w' | 'b'; pose: MutableRefObject<Pose> }) {
  const m = stone[color];
  const body = useRef<Group>(null);
  useFrame(() => {
    if (body.current) body.current.rotation.x = pose.current.bow;
  });
  return (
    <group scale={HEIGHT.n / 1.08}>
      <Pedestal m={m} />
      <group position={[0, 0.17, -0.2]} ref={body}>
        <Part
          g={unit.cylinder}
          m={m}
          p={[0, 0.43, 0.2]}
          r={[Math.PI / 2, 0, 0]}
          s={[0.13, 0.42, 0.14]}
        />
        <Part g={unit.sphere} m={m} p={[0, 0.44, 0.4]} s={[0.14, 0.15, 0.14]} />
        <Part g={unit.sphere} m={m} p={[0, 0.44, 0]} s={[0.14, 0.15, 0.14]} />
        {[-0.08, 0.08].flatMap((x) =>
          [0.02, 0.38].map((z) => (
            <Part
              g={unit.cylinder}
              key={`${x}${z}`}
              m={m}
              p={[x, 0.17, z]}
              s={[0.035, 0.34, 0.035]}
            />
          )),
        )}
        <Part g={unit.taper} m={m} p={[0, 0.63, 0.47]} r={[0.5, 0, 0]} s={[0.1, 0.32, 0.11]} />
        <Part g={unit.taper} m={m} p={[0, 0.77, 0.63]} r={[1.9, 0, 0]} s={[0.075, 0.26, 0.07]} />
        <Part g={unit.cone} m={m} p={[-0.04, 0.87, 0.54]} s={[0.02, 0.07, 0.02]} />
        <Part g={unit.cone} m={m} p={[0.04, 0.87, 0.54]} s={[0.02, 0.07, 0.02]} />
        <Part g={unit.box} m={m} p={[0, 0.68, 0.4]} r={[0.5, 0, 0]} s={[0.03, 0.32, 0.09]} />
        <Part
          g={unit.taper}
          m={m}
          p={[0, 0.34, -0.15]}
          r={[Math.PI - 0.5, 0, 0]}
          s={[0.035, 0.3, 0.035]}
        />
        {/* Caparison and saddle. */}
        <Part g={unit.box} m={m} p={[0, 0.4, 0.2]} s={[0.29, 0.2, 0.4]} />
        <Part g={unit.box} m={gold} p={[0, 0.59, 0.2]} s={[0.2, 0.03, 0.22]} />
      </group>
    </group>
  );
}

export function CinemaFigure({
  color,
  kind,
  pose,
}: {
  color: 'w' | 'b';
  kind: Kind;
  pose: MutableRefObject<Pose>;
}) {
  return (
    <group rotation={[0, Math.PI / 2, 0]}>
      {kind === 'n' ? (
        <Horse color={color} pose={pose} />
      ) : (
        <Person color={color} kind={kind} pose={pose} />
      )}
    </group>
  );
}
