'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { Chess, type Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { PerformanceMonitor } from '@react-three/drei';
import { BackSide, Vector3, type Group, type Texture } from 'three';

import { BoardCoordinates, SquareName } from './board-coordinates';
import styles from './chess-3d-board.module.css';
import { hintSquares, walkPath, type PlayedMove } from '@/components/game/move-path';
import { MoveToast } from '@/components/game/move-toast';
import { useDialogA11y } from '@/components/ui/dialog-a11y';
import { MedievalFrame, MedievalStatue, MedievalTower, useMedievalMaterials } from './medieval';
import { IvoryEnvironment, IvoryFrame, IvoryLights, IvoryPiece, useIvoryMaps } from './ivory';
import { IVORY_KNIGHT_YAW } from './ivory-geometry';
import { CinemaFigure } from './cinema-figures';
import { CineFx, KiAura } from './cinema-fx';
import {
  CINE_HIDE_FROM,
  CINE_HIDE_TO,
  CINE_IMPACT,
  CINE_RETURN_AT,
  CINE_TOTAL,
  REST_POSE,
  actorPose,
  captorMotion,
  cineCamera,
  liveCine,
  stageFor,
  victimState,
  type Cine,
} from './cinema-scenes';
import { attackingSquares } from './piece-attacks';
import { playCaptureSound } from '@/components/game/capture-fx/capture-sound';
import { PIECE_HEIGHT, pieceGeometry } from './piece-geometry';
import { initialPieces, reconcile, type TrackedPiece } from './piece-tracker';

const NO_AURAS: ReadonlySet<number> = new Set();

export type Board3DOrientation = 'white' | 'black';

export interface Chess3DBoardProps {
  disabled?: boolean | undefined;
  fen: string;
  /** Treinador's suggested move: its path is marked up to the target square. */
  hint?: { from: string; to: string } | undefined;
  lastMove?: { from: string; to: string } | undefined;
  /** Course stars still to collect. */
  marks?: readonly string[] | undefined;
  movableColor?: 'w' | 'b' | undefined;
  /** Square name ("A1") on every empty square. */
  squareNames?: boolean;
  /** Grey light squares, so the white pieces stand out from them. */
  greyLightSquares?: boolean;
  onMove: (uci: string) => void;
  orientation: Board3DOrientation;
  toast?: PlayedMove | null;
  walk?: PlayedMove | null;
  /** Letters and numbers on the wooden frame. */
  coordinates?: boolean;
  /** Outline around each color's pieces (gold on dark, bronze on light). */
  rims?: { b: boolean; w: boolean };
  /** Medieval set: carved statues (photographed angles) on a stone and oak board. */
  medieval?: boolean;
  /** Ivory set ("Marfim"): turned ivory and graphite pieces on a walnut board, studio light. */
  ivory?: boolean;
  /** "Medieval Cinema" set: articulated stone figures on the medieval board. */
  cinema?: boolean;
  /** With `cinema`: a capture plays as a staged scene (camera shot, power, bow). */
  cinemaScenes?: boolean;
  /** Ki aura on the pieces that moved into an attack. */
  kiAura?: boolean;
}

interface View {
  azimuth: number;
  distance: number;
  polar: number;
}

const FILES = 'abcdefgh';
const PROMOTION_CHOICES = [
  ['q', 'Dama'],
  ['r', 'Torre'],
  ['b', 'Bispo'],
  ['n', 'Cavalo'],
] as const;
const MOVE_SECONDS = 0.55;
const DEFAULT_RIMS = { b: true, w: true };
const WALK_STEP_SECONDS = 0.38;
/** Pointer travel (px) that turns a tap into a camera drag; finger jitter must still count as a tap. */
const DRAG_THRESHOLD_PX = 10;
const VIEW_KEY = 'xadrez.board3d_view';

interface StoredView {
  /** Azimuth relative to the player's side, so a locked angle works for both colors. */
  azimuth: number;
  distance: number;
  locked: boolean;
  polar: number;
}

function readStoredView(): StoredView | null {
  try {
    const raw = window.localStorage.getItem(VIEW_KEY);
    return raw ? (JSON.parse(raw) as StoredView) : null;
  } catch {
    return null;
  }
}

function writeStoredView(view: StoredView) {
  try {
    window.localStorage.setItem(VIEW_KEY, JSON.stringify(view));
  } catch {
    // The lock still works on this page; it just won't persist.
  }
}
const GHOST_SECONDS = 0.9;
const DEFAULT_POLAR = 0.95;
const MIN_POLAR = 0.15;
// The medieval pieces are photos taken near eye level: seen from high above they look like flat
// cut-outs, so that board starts lower and cannot be tilted far up.
const MEDIEVAL_POLAR = 1.17;
// About 20° more than first shipped, at the user's request: higher views trade realism for overview.
const MEDIEVAL_MIN_POLAR = 0.65;
// Far enough that the near corners of the board stay inside a square frame on any screen.
const DEFAULT_DISTANCE = 17;
/** Ivory camera presets (spec camera-presets.json): elevation above the board and nominal distance. */
const IVORY_PRESETS = {
  imersiva: { distance: 11, elevation: 32, label: 'Imersiva' },
  jogo: { distance: 12, elevation: 52, label: 'Jogo' },
  tatica: { distance: 13, elevation: 72, label: 'Tática' },
} as const;
type IvoryPreset = keyof typeof IVORY_PRESETS;
const IVORY_MIN_POLAR = ((90 - 85) * Math.PI) / 180;
const IVORY_MAX_POLAR = ((90 - 25) * Math.PI) / 180;
/** Spec distances are for a 12-unit reference; the existing rig is tuned for 17. */
const ivoryDistance = (nominal: number) => (DEFAULT_DISTANCE * nominal) / 12;
const ivoryPolar = (elevation: number) => ((90 - elevation) * Math.PI) / 180;

/** Board coordinates: file a..h -> x -3.5..3.5, rank 1..8 -> z 3.5..-3.5 (white side at +z). */
function squareToXZ(square: string): [number, number] {
  const file = FILES.indexOf(square[0]!);
  const rank = Number(square[1]);
  return [file - 3.5, 3.5 - (rank - 1)];
}

function ease(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

interface Ghost {
  captor: [number, number] | null;
  key: number;
  piece: TrackedPiece;
  /** Victim of a capture scene: the scene moves it, not the knock-off animation. */
  staged: boolean;
}

function PieceMesh({
  aura = false,
  captorXZ,
  cine,
  cinema = false,
  ghost,
  ivory = false,
  medieval = false,
  piece,
  rim = true,
  selected,
  staged = false,
  walk,
}: {
  aura?: boolean;
  captorXZ?: [number, number] | null;
  cine: MutableRefObject<Cine | null>;
  cinema?: boolean;
  /** Ghost only: victim of a capture scene. */
  staged?: boolean;
  ghost?: boolean;
  ivory?: boolean;
  medieval?: boolean;
  piece: TrackedPiece;
  rim?: boolean;
  selected?: boolean;
  walk?: boolean;
}) {
  const group = useRef<Group>(null);
  const [tx, tz] = squareToXZ(piece.square);
  const anim = useRef({
    lastSquare: piece.square,
    points: [[tx, tz]] as Array<[number, number]>,
    start: -1,
    walking: false,
  });
  // Fixed mount position: a position prop that follows piece.square would teleport the piece
  // to its destination on re-render, before useFrame could walk it there.
  const [home] = useState<[number, number, number]>(() => [tx, 0, tz]);
  const reduced = prefersReducedMotion();
  const geometry = useMemo(() => pieceGeometry(piece.type), [piece.type]);
  const white = piece.color === 'w';
  const baseYaw =
    (white ? Math.PI / 2 : -Math.PI / 2) + (ivory && piece.type === 'n' ? IVORY_KNIGHT_YAW : 0);
  const pose = useRef(REST_POSE[piece.type]);

  useFrame((state) => {
    const node = group.current;
    if (!node) return;
    const now = state.clock.elapsedTime;
    const a = anim.current;
    const scene = liveCine(cine.current);
    const sceneTime = scene ? performance.now() / 1000 - scene.at : 0;
    if (staged) {
      // Only the scene it was captured in moves this ghost; afterwards it is gone.
      const v = scene?.victimId === piece.id ? victimState(scene.attacker, sceneTime) : null;
      node.visible = Boolean(v?.visible);
      if (!v) return;
      node.position.set(
        tx + Math.sin(sceneTime * 70) * v.shake,
        v.y,
        tz + Math.cos(sceneTime * 83) * v.shake,
      );
      node.rotation.set(v.wobble, baseYaw + v.spin, 0);
      return;
    }
    if (scene && !ghost && scene.captorId === piece.id) {
      // The scene owns the capturing piece: it waits at its mark, acts, then takes the square.
      a.lastSquare = piece.square;
      a.start = -1;
      const m = captorMotion(scene.attacker, sceneTime);
      const sx = scene.from[0] + (scene.stage[0] - scene.from[0]) * m.approach;
      const sz = scene.from[1] + (scene.stage[1] - scene.from[1]) * m.approach;
      node.position.set(
        sx + (scene.end[0] - sx) * m.advance,
        m.lift,
        sz + (scene.end[1] - sz) * m.advance,
      );
      const turn = ((scene.yaw - baseYaw + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      node.rotation.set(0, baseYaw + turn * m.face, 0);
      node.scale.set(1, 1, 1);
      node.visible = true;
      pose.current = actorPose(scene.attacker, sceneTime);
      return;
    }
    if (!ghost) {
      node.visible = !scene || sceneTime < CINE_HIDE_FROM || sceneTime > CINE_HIDE_TO;
      node.rotation.y = baseYaw;
      pose.current = REST_POSE[piece.type];
    }
    if (!ghost && a.lastSquare !== piece.square) {
      const origin: [number, number] = [node.position.x, node.position.z];
      a.walking = Boolean(walk);
      a.points = walk
        ? [
            origin,
            ...walkPath(a.lastSquare as Square, piece.square as Square, piece.type).map(squareToXZ),
          ]
        : [origin, [tx, tz]];
      a.start = now;
      a.lastSquare = piece.square;
    }
    if (ghost) {
      // Captured: wait for the capturing piece to arrive, then get knocked off the board.
      const t = (now - a.start) / GHOST_SECONDS;
      if (a.start < 0) {
        a.start = now + (reduced ? 0 : MOVE_SECONDS * 0.8);
        return;
      }
      if (t < 0) return;
      const k = Math.min(t, 1);
      const dir = captorXZ
        ? [tx - captorXZ[0], tz - captorXZ[1]]
        : [Math.sign(tx) || 1, Math.sign(tz) || 1];
      const len = Math.hypot(dir[0]!, dir[1]!) || 1;
      node.position.set(
        tx + (dir[0]! / len) * 2.4 * k,
        Math.sin(Math.PI * Math.min(k * 1.2, 1)) * 1.6 - 0.2 * k * k,
        tz + (dir[1]! / len) * 2.4 * k,
      );
      node.rotation.set(k * 5, k * 4, k * 6);
      node.scale.setScalar(Math.max(1 - k * k, 0.001));
      return;
    }
    let x = tx;
    let z = tz;
    let y = 0;
    if (a.start >= 0) {
      const segments = a.points.length - 1;
      const duration = a.walking ? segments * WALK_STEP_SECONDS : MOVE_SECONDS;
      const raw = reduced ? 1 : (now - a.start) / duration;
      const k = Math.min(Math.max(raw, 0), 1);
      // Walking: glides along the path (eased start/stop) with a light step on each square;
      // otherwise a single eased arc.
      const along = a.walking ? ease(k) * segments : ease(k);
      const s = a.walking ? Math.min(Math.floor(along), segments - 1) : 0;
      const local = along - s;
      const p = a.points[s]!;
      const q = a.points[s + 1]!;
      x = p[0] + (q[0] - p[0]) * local;
      z = p[1] + (q[1] - p[1]) * local;
      const hop = a.walking ? 0.1 : piece.type === 'n' ? 1.5 : 0.7;
      y = Math.sin(Math.PI * (a.walking ? local : k)) * hop;
      // Landing squash gives the capture a visible "thud".
      const squash = k > 0.85 && k < 1 ? 1 - Math.sin(((k - 0.85) / 0.15) * Math.PI) * 0.08 : 1;
      node.scale.set(1 + (1 - squash) * 0.5, squash, 1 + (1 - squash) * 0.5);
      if (k >= 1) a.start = -1;
    } else {
      node.scale.set(1, 1, 1);
    }
    if (selected && a.start < 0) y += 0.18 + Math.sin(now * 5) * 0.03;
    node.position.set(x, y, z);
  });

  return (
    <group position={home} ref={group} rotation={[0, baseYaw, 0]}>
      {aura && !ghost ? (
        <KiAura color={piece.color} height={PIECE_HEIGHT[piece.type]} solid={ivory} />
      ) : null}
      {ivory ? (
        <IvoryPiece color={piece.color} kind={piece.type} />
      ) : (medieval || cinema) && piece.type === 'r' ? (
        <MedievalTower color={piece.color} />
      ) : cinema && piece.type !== 'r' ? (
        <CinemaFigure color={piece.color} kind={piece.type} pose={pose} />
      ) : medieval ? (
        <MedievalStatue color={piece.color} kind={piece.type} />
      ) : (
        <>
          <mesh castShadow geometry={geometry} receiveShadow>
            <meshStandardMaterial
              color={white ? '#f1e7d0' : '#5a5e72'}
              metalness={white ? 0.15 : 0.3}
              roughness={white ? 0.45 : 0.3}
            />
          </mesh>
          {/* Rim keeps every piece readable (king vs queen vs pawn) against same-tone squares and from
          above: gold around dark pieces, deep bronze around light ones. */}
          {rim ? (
            <mesh geometry={geometry} scale={[1.06, 1.02, 1.06]}>
              <meshBasicMaterial color={white ? '#7a5326' : '#d8b25a'} side={BackSide} />
            </mesh>
          ) : null}
        </>
      )}
    </group>
  );
}

function Burst({ at }: { at: [number, number] }) {
  const group = useRef<Group>(null);
  const born = useRef(-1);
  const seeds = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const angle = (i / 14) * Math.PI * 2 + (i % 3) * 0.3;
        return { speed: 1.2 + (i % 4) * 0.5, angle, up: 1.6 + (i % 3) * 0.7 };
      }),
    [],
  );
  useFrame((state) => {
    const node = group.current;
    if (!node) return;
    if (born.current < 0) born.current = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - born.current - MOVE_SECONDS * 0.8;
    node.visible = t > 0 && t < 0.8;
    if (!node.visible) return;
    node.children.forEach((child, i) => {
      const seed = seeds[i]!;
      child.position.set(
        Math.cos(seed.angle) * seed.speed * t,
        seed.up * t - 4.5 * t * t + 0.4,
        Math.sin(seed.angle) * seed.speed * t,
      );
      child.scale.setScalar(Math.max(0.0001, 1 - t / 0.8));
    });
  });
  return (
    <group position={[at[0], 0, at[1]]} ref={group} visible={false}>
      {seeds.map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[0.07, 8, 8]} />
          <meshStandardMaterial
            color={i % 2 ? '#ffcf5a' : '#ff6a3d'}
            emissive="#ff8a2b"
            emissiveIntensity={0.6}
          />
        </mesh>
      ))}
    </group>
  );
}

interface Rig {
  current: View;
  target: View;
}

/**
 * Distances are tuned for a square frame, where the board's width is the limit. A wider frame
 * lets the camera come closer until the board's depth (its height on screen) is the limit, so
 * the board fills the space instead of floating in the middle of it.
 */
const VERTICAL_FIT = 0.72;
/** Aim slightly towards the player so the near rank and file letters stay clear of overlays. */
const AIM_TOWARDS_PLAYER = 0.6;
function frameFit(aspect: number) {
  return Math.max(VERTICAL_FIT, 1.06 / Math.max(aspect, 0.1));
}

/** Eases the camera toward the requested view (spherical coordinates around the board centre). */
function stepCamera(
  rig: Rig,
  camera: {
    lookAt: (x: number, y: number, z: number) => void;
    position: { set: (x: number, y: number, z: number) => void };
  },
  delta: number,
  aspect = 1,
) {
  const { current, target } = rig;
  const k = 1 - Math.exp(-delta * 7);
  current.azimuth += (target.azimuth - current.azimuth) * k;
  current.polar += (target.polar - current.polar) * k;
  current.distance += (target.distance - current.distance) * k;
  const r = current.distance * frameFit(aspect);
  camera.position.set(
    r * Math.sin(current.polar) * Math.sin(current.azimuth),
    r * Math.cos(current.polar),
    r * Math.sin(current.polar) * Math.cos(current.azimuth),
  );
  camera.lookAt(
    Math.sin(current.azimuth) * AIM_TOWARDS_PLAYER,
    0,
    Math.cos(current.azimuth) * AIM_TOWARDS_PLAYER,
  );
}

const shotPos = new Vector3();
const shotLook = new Vector3();

function CameraRig({
  cine,
  view,
}: {
  cine: MutableRefObject<Cine | null>;
  view: MutableRefObject<Rig>;
}) {
  useFrame((state, delta) => {
    stepCamera(view.current, state.camera, delta, state.size.width / (state.size.height || 1));
    const scene = liveCine(cine.current);
    if (!scene) return;
    const t = performance.now() / 1000 - scene.at;
    // The capture scene takes the camera, blended with the game view at both ends.
    const shot = cineCamera(scene, t);
    const { azimuth } = view.current.current;
    state.camera.position.lerp(shotPos.set(...shot.pos), shot.weight);
    shotLook
      .set(Math.sin(azimuth) * AIM_TOWARDS_PLAYER, 0, Math.cos(azimuth) * AIM_TOWARDS_PLAYER)
      .lerp(shotPos.set(...shot.look), shot.weight);
    state.camera.lookAt(shotLook);
  });
  return null;
}

/** Square textures; `*Alt` are optional grain variants picked per square so the board isn't tiled. */
type SquareMaps = {
  dark: Texture | null;
  darkAlt?: Texture[];
  light: Texture | null;
  lightAlt?: Texture[];
  roughness?: number;
};
const CHECK_RED = '#e8574a';

const HINT_BLUE = '#2fa3ff';
const STAR_GOLD = '#f5c400';
const NO_MARKS: readonly string[] = [];

function squareMap(maps: SquareMaps, light: boolean, index: number): Texture | null {
  const variants = light ? maps.lightAlt : maps.darkAlt;
  return variants?.length ? variants[index % variants.length]! : light ? maps.light : maps.dark;
}

function BoardSquares({
  checkSquare = null,
  destinations,
  flip,
  greyLight,
  hint,
  lastMove,
  maps,
  marks,
  occupied,
  onSquare,
  selected,
  squareNames,
}: {
  destinations: Map<string, boolean>;
  flip: boolean;
  greyLight: boolean;
  hint: { from: string | null; path: Set<string>; target: string | null };
  lastMove?: { from: string; to: string } | undefined;
  checkSquare?: string | null;
  maps?: SquareMaps | undefined;
  marks: readonly string[];
  occupied: Set<string>;
  onSquare: (square: Square) => void;
  selected: string | null;
  squareNames: boolean;
}) {
  const cells = [];
  for (let file = 0; file < 8; file += 1) {
    for (let rank = 1; rank <= 8; rank += 1) {
      const square = `${FILES[file]}${rank}` as Square;
      const [x, z] = squareToXZ(square);
      // file is 0-based and rank 1-based: a1 (0 + 1) is a dark square.
      const light = (file + rank) % 2 === 0;
      const highlighted =
        square === selected || square === lastMove?.from || square === lastMove?.to;
      const destination = destinations.get(square);
      const hinted = square === hint.from || square === hint.target || hint.path.has(square);
      cells.push(
        <group key={square} position={[x, 0, z]}>
          <mesh
            onPointerUp={(event) => {
              event.stopPropagation();
              onSquare(square);
            }}
            receiveShadow
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[1, 1]} />
            {maps ? (
              <meshStandardMaterial
                // Optional grey light squares so the white pieces stand out from them.
                color={
                  square === checkSquare
                    ? CHECK_RED
                    : highlighted
                      ? light
                        ? '#f0e68a'
                        : '#c9b04a'
                      : light && greyLight
                        ? '#979797'
                        : '#ffffff'
                }
                map={squareMap(maps, light, file * 8 + rank)}
                roughness={maps.roughness ?? 0.85}
              />
            ) : (
              <meshStandardMaterial
                color={
                  square === checkSquare
                    ? CHECK_RED
                    : highlighted
                      ? light
                        ? '#d9d46a'
                        : '#b9b23a'
                      : light
                        ? greyLight
                          ? '#8f8b84'
                          : '#ead7ae'
                        : '#8f6340'
                }
                roughness={0.7}
              />
            )}
          </mesh>
          {hinted ? (
            <mesh
              position={[0, 0.015, 0]}
              raycast={() => undefined}
              renderOrder={-1}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              {square === hint.target ? (
                <ringGeometry args={[0.32, 0.46, 40]} />
              ) : square === hint.from ? (
                <ringGeometry args={[0.44, 0.5, 4, 1, Math.PI / 4]} />
              ) : (
                <circleGeometry args={[0.13, 24]} />
              )}
              <meshBasicMaterial color={HINT_BLUE} opacity={0.9} transparent />
            </mesh>
          ) : null}
          {marks.includes(square) ? (
            <mesh
              position={[0, 0.03, 0]}
              raycast={() => undefined}
              rotation={[-Math.PI / 2, 0, Math.PI / 2]}
            >
              <circleGeometry args={[0.26, 5]} />
              <meshBasicMaterial color={STAR_GOLD} />
            </mesh>
          ) : null}
          {squareNames && !occupied.has(square) ? (
            <SquareName flip={flip} light={light} text={square.toUpperCase()} />
          ) : null}
          {destination !== undefined ? (
            <mesh
              onPointerUp={(event) => {
                event.stopPropagation();
                onSquare(square);
              }}
              position={[0, 0.02, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              {destination ? (
                <ringGeometry args={[0.34, 0.46, 32]} />
              ) : (
                <circleGeometry args={[0.16, 24]} />
              )}
              <meshBasicMaterial
                color={destination ? '#d10e17' : '#1f7a3a'}
                transparent
                opacity={0.85}
              />
            </mesh>
          ) : null}
        </group>,
      );
    }
  }
  return <>{cells}</>;
}

function Scene({
  auras,
  checkSquare,
  cine,
  cinema,
  coordinates,
  rims,
  destinations,
  flip,
  ghosts,
  greyLight,
  hint,
  ivory,
  lastMove,
  marks,
  medieval,
  onPerformance,
  onSquare,
  pieces,
  selected,
  squareNames,
  view,
  walk,
}: {
  /** Ids of the pieces wrapped in the ki aura. */
  auras: ReadonlySet<number>;
  cine: MutableRefObject<Cine | null>;
  cinema: boolean;
  checkSquare: string | null;
  greyLight: boolean;
  hint: { from: string | null; path: Set<string>; target: string | null };
  ivory: boolean;
  marks: readonly string[];
  onPerformance: (low: boolean) => void;
  squareNames: boolean;
  medieval: boolean;
  coordinates: boolean;
  rims: { b: boolean; w: boolean };
  destinations: Map<string, boolean>;
  flip: boolean;
  ghosts: Ghost[];
  lastMove?: { from: string; to: string } | undefined;
  onSquare: (square: Square) => void;
  pieces: TrackedPiece[];
  selected: string | null;
  view: MutableRefObject<Rig>;
  walk: boolean;
}) {
  const maps = useMedievalMaterials();
  const ivoryMaps = useIvoryMaps(ivory);
  // The cinema set stands on the medieval board: same stone, oak and torchlight.
  const stoneBoard = medieval || cinema;
  const coarse = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches,
    [],
  );
  return (
    <>
      <color args={[ivory ? '#0d0b0b' : stoneBoard ? '#0f0b09' : '#14110f']} attach="background" />
      {ivory ? (
        <>
          <IvoryEnvironment />
          <IvoryLights coarse={coarse} />
          <PerformanceMonitor
            onDecline={() => onPerformance(true)}
            onIncline={() => onPerformance(false)}
          />
        </>
      ) : null}
      {/* Torchlight from the players' sides warms the stone. */}
      {stoneBoard ? (
        <>
          <pointLight
            color="#ffb46b"
            decay={1.4}
            distance={22}
            intensity={18}
            position={[-6, 4, 7]}
          />
          <pointLight
            color="#ffb46b"
            decay={1.4}
            distance={22}
            intensity={14}
            position={[6, 4, -7]}
          />
        </>
      ) : null}
      {ivory ? null : (
        <>
          <ambientLight intensity={0.75} />
          <hemisphereLight args={['#fff3dc', '#3a2a20', 0.5]} />
          <directionalLight intensity={0.9} position={[-6, 8, -5]} />
          <directionalLight
            castShadow
            intensity={1.8}
            position={[5, 10, 6]}
            shadow-camera-bottom={-8}
            shadow-camera-left={-8}
            shadow-camera-right={8}
            shadow-camera-top={8}
            shadow-mapSize={[1024, 1024]}
          />
        </>
      )}
      <CameraRig cine={cine} view={view} />
      {cinema ? <CineFx cine={cine} /> : null}
      {ivoryMaps ? (
        <IvoryFrame maps={ivoryMaps} />
      ) : stoneBoard ? (
        <MedievalFrame maps={maps} />
      ) : (
        <mesh position={[0, -0.27, 0]} receiveShadow>
          <boxGeometry args={[9.4, 0.5, 9.4]} />
          <meshStandardMaterial color="#4a2f1c" roughness={0.6} />
        </mesh>
      )}
      {coordinates ? <BoardCoordinates flip={flip} /> : null}
      <BoardSquares
        checkSquare={checkSquare}
        destinations={destinations}
        flip={flip}
        greyLight={greyLight && !ivory}
        hint={hint}
        lastMove={lastMove}
        maps={ivoryMaps ?? (stoneBoard ? maps : undefined)}
        marks={marks}
        occupied={new Set(pieces.map((piece) => piece.square))}
        onSquare={onSquare}
        selected={selected}
        squareNames={squareNames}
      />
      {pieces.map((piece) => (
        <group
          key={piece.id}
          onPointerUp={(event) => {
            event.stopPropagation();
            onSquare(piece.square as Square);
          }}
        >
          <PieceMesh
            aura={auras.has(piece.id)}
            cine={cine}
            cinema={cinema}
            ivory={ivory}
            medieval={medieval}
            piece={piece}
            rim={rims[piece.color]}
            selected={piece.square === selected}
            walk={walk}
          />
        </group>
      ))}
      {ghosts.map((ghost) => (
        <group key={`ghost-${ghost.key}`}>
          <PieceMesh
            captorXZ={ghost.captor}
            cine={cine}
            cinema={cinema}
            ghost
            ivory={ivory}
            medieval={medieval}
            piece={ghost.piece}
            rim={rims[ghost.piece.color]}
            staged={ghost.staged}
          />
          {ghost.staged ? null : <Burst at={squareToXZ(ghost.piece.square)} />}
        </group>
      ))}
    </>
  );
}

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export default function Chess3DBoard({
  disabled,
  fen,
  hint,
  lastMove,
  marks = NO_MARKS,
  movableColor,
  onMove,
  orientation,
  squareNames = false,
  greyLightSquares = true,
  toast = null,
  walk = null,
  coordinates = true,
  rims = DEFAULT_RIMS,
  medieval = false,
  ivory = false,
  cinema = false,
  cinemaScenes = true,
  kiAura = true,
}: Chess3DBoardProps) {
  const hinted = useMemo(
    () => ({ from: hint?.from ?? null, ...hintSquares(fen, hint) }),
    [fen, hint],
  );
  const [initial] = useState(() => initialPieces(fen));
  const tracker = useRef(initial);
  const [pieces, setPieces] = useState<TrackedPiece[]>(initial.pieces);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const cine = useRef<Cine | null>(null);
  const [auras, setAuras] = useState<ReadonlySet<number>>(() => new Set());
  const scenes = useRef(false);
  useEffect(() => {
    scenes.current = cinema && cinemaScenes && !ivory;
  }, [cinema, cinemaScenes, ivory]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const promotionFocusRef = useRef<HTMLButtonElement>(null);
  useDialogA11y({
    initialFocusRef: promotionFocusRef,
    onCancel: () => setPromotion(null),
    open: promotion !== null,
  });
  const [supported, setSupported] = useState(true);
  const ghostKey = useRef(0);
  const dragged = useRef(false);
  const view = useRef({
    current: {
      azimuth: orientation === 'white' ? 0 : Math.PI,
      distance: DEFAULT_DISTANCE,
      polar: DEFAULT_POLAR,
    },
    target: {
      azimuth: orientation === 'white' ? 0 : Math.PI,
      distance: DEFAULT_DISTANCE,
      polar: DEFAULT_POLAR,
    },
  });
  const drag = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null);
  const [locked, setLocked] = useState(false);
  const [preset, setPreset] = useState<IvoryPreset>('jogo');
  const [lowPerformance, setLowPerformance] = useState(false);
  // Bumped when the browser restores a lost WebGL context, so the canvas is rebuilt.
  const [canvasKey, setCanvasKey] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    queueMicrotask(() => setSupported(webglAvailable()));
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  // Keeps the player's side in front; a locked angle is restored relative to that side.
  useEffect(() => {
    const base = orientation === 'white' ? 0 : Math.PI;
    const stored = readStoredView();
    const target = view.current.target;
    if (!stored?.locked) {
      target.azimuth = base;
      return;
    }
    Object.assign(target, {
      azimuth: base + stored.azimuth,
      distance: stored.distance,
      polar: stored.polar,
    });
    queueMicrotask(() => setLocked(true));
  }, [orientation]);

  const defaultPolar = ivory
    ? ivoryPolar(IVORY_PRESETS.jogo.elevation)
    : medieval
      ? MEDIEVAL_POLAR
      : DEFAULT_POLAR;
  const minPolar = ivory ? IVORY_MIN_POLAR : medieval ? MEDIEVAL_MIN_POLAR : MIN_POLAR;
  const maxPolar = ivory ? IVORY_MAX_POLAR : 1.45;
  const minDistance = ivory ? ivoryDistance(9) : 7;
  const maxDistance = ivory ? ivoryDistance(18) : 18;
  // Switching board style moves the camera to that style's angle; a locked view is only clamped.
  useEffect(() => {
    const target = view.current.target;
    target.polar = readStoredView()?.locked ? Math.max(target.polar, minPolar) : defaultPolar;
    if (!readStoredView()?.locked) target.distance = DEFAULT_DISTANCE;
  }, [defaultPolar, minPolar]);

  function toggleLock() {
    const base = orientation === 'white' ? 0 : Math.PI;
    const target = view.current.target;
    const next = !locked;
    writeStoredView({
      azimuth: target.azimuth - base,
      distance: target.distance,
      locked: next,
      polar: target.polar,
    });
    setLocked(next);
  }

  // Reconcile the incoming FEN with the tracked pieces; vanished pieces become animated ghosts.
  useEffect(() => {
    const state = tracker.current;
    let result;
    try {
      result = reconcile(state.pieces, fen, state.nextId);
    } catch {
      return;
    }
    if (result.pieces.length === state.pieces.length && result.captures.length === 0) {
      const same = result.pieces.every((piece, i) => piece === state.pieces[i]);
      if (same) return;
    }
    tracker.current = { nextId: result.nextId, pieces: result.pieces };
    const attacking = attackingSquares(fen);
    const before = new Map(state.pieces.map((piece) => [piece.id, piece.square]));
    // A single capture with a known captor plays as a scene (not when several moves were skipped).
    const only = result.captures.length === 1 ? result.captures[0]! : null;
    const taker = only ? result.pieces.find((piece) => piece.id === only.captorId) : undefined;
    const origin = taker ? state.pieces.find((piece) => piece.id === taker.id) : undefined;
    const staged = Boolean(scenes.current && taker && origin && !prefersReducedMotion());
    if (staged && only && taker && origin) {
      const from = squareToXZ(origin.square);
      const to = squareToXZ(only.victim.square);
      const placed = stageFor(from, to, origin.type);
      const { azimuth } = view.current.current;
      cine.current = {
        ...placed,
        at: performance.now() / 1000,
        attacker: origin.type,
        captorId: taker.id,
        end: squareToXZ(taker.square),
        from,
        // Stops on the side of the duel nearer to where the player is looking from.
        side:
          Math.sign(-placed.dir[1] * Math.sin(azimuth) + placed.dir[0] * Math.cos(azimuth)) || 1,
        to,
        victimId: only.victim.id,
        victimWhite: only.victim.color === 'w',
      };
      playCaptureSound(origin.type, 1.4, CINE_IMPACT);
    }
    queueMicrotask(() => {
      setPieces(result.pieces);
      setSelected(null);
      // Ki aura: a piece that moved into an attack keeps it for as long as it attacks something.
      setAuras((old) => {
        const next = new Set<number>();
        for (const piece of result.pieces) {
          const moved = before.has(piece.id) && before.get(piece.id) !== piece.square;
          if ((moved || old.has(piece.id)) && attacking.has(piece.square)) next.add(piece.id);
        }
        return next;
      });
      if (result.captures.length > 0) {
        const created = result.captures.map(({ captorId, victim }) => {
          const captor = result.pieces.find((piece) => piece.id === captorId);
          ghostKey.current += 1;
          return {
            captor: captor ? squareToXZ(captor.square) : null,
            key: ghostKey.current,
            piece: victim,
            staged,
          } satisfies Ghost;
        });
        setGhosts((old) => [...old, ...created]);
        const timer = window.setTimeout(
          () => setGhosts((old) => old.filter((ghost) => !created.includes(ghost))),
          staged ? CINE_TOTAL * 1000 : 2500,
        );
        timers.current.push(timer);
      }
    });
  }, [fen]);

  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return null;
    }
  }, [fen]);

  const destinations = useMemo(() => {
    const map = new Map<string, boolean>();
    if (!chess || !selected) return map;
    for (const move of chess.moves({ square: selected, verbose: true })) {
      map.set(move.to, move.captured !== undefined);
    }
    return map;
  }, [chess, selected]);

  const checkSquare = useMemo(() => {
    if (!chess || !chess.isCheck()) return null;
    for (const row of chess.board()) {
      for (const cell of row) {
        if (cell?.type === 'k' && cell.color === chess.turn()) return cell.square;
      }
    }
    return null;
  }, [chess]);

  const onSquare = useCallback(
    (square: Square) => {
      if (disabled || !chess || dragged.current) return;
      if (selected && destinations.has(square)) {
        const move = chess
          .moves({ square: selected, verbose: true })
          .find((candidate) => candidate.to === square);
        if (move) {
          if (move.promotion) {
            setPromotion({ from: move.from, to: move.to });
            return;
          }
          onMove(`${move.from}${move.to}`);
          setSelected(null);
          return;
        }
      }
      const piece = chess.get(square);
      const allowed =
        piece && piece.color === chess.turn() && (!movableColor || piece.color === movableColor);
      setSelected(allowed ? square : null);
    },
    [chess, destinations, disabled, movableColor, onMove, selected],
  );

  function rotate(dAzimuth: number, dPolar: number, dDistance = 0) {
    if (locked) return;
    const target = view.current.target;
    target.azimuth += dAzimuth;
    target.polar = Math.min(Math.max(target.polar + dPolar, minPolar), maxPolar);
    target.distance = Math.min(Math.max(target.distance + dDistance, minDistance), maxDistance);
  }

  function applyPreset(next: IvoryPreset) {
    if (locked) return;
    setPreset(next);
    const target = view.current.target;
    target.polar = ivoryPolar(IVORY_PRESETS[next].elevation);
    target.distance = ivoryDistance(IVORY_PRESETS[next].distance);
  }

  function reset() {
    const base = orientation === 'white' ? 0 : Math.PI;
    const target = view.current.target;
    const turns = Math.round((view.current.current.azimuth - base) / (2 * Math.PI));
    target.azimuth = base + turns * 2 * Math.PI;
    target.polar = defaultPolar;
    target.distance = DEFAULT_DISTANCE;
    setPreset('jogo');
  }

  // Wheel zoom needs a non-passive native listener so the page does not scroll with it.
  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      rotate(0, 0, event.deltaY * 0.01);
    }
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  });

  if (!supported) {
    return (
      <p className={styles.fallback} role="status">
        Este dispositivo não suporta o tabuleiro 3D (WebGL). Use o tabuleiro 2D.
      </p>
    );
  }

  const summary = chess
    ? `Tabuleiro 3D. Vez das ${chess.turn() === 'w' ? 'brancas' : 'pretas'}. Clique no tabuleiro e use as setas do teclado ou os botões para girar a visão.`
    : 'Tabuleiro 3D';

  return (
    <div className={`${styles.wrapper} board3d`}>
      <div
        aria-label={summary}
        className={`${styles.viewport} board3dViewport`}
        onKeyDown={(event) => {
          // Arrow keys move the view like a drag does (focus comes from clicking the board).
          const step = event.shiftKey ? 0.3 : 0.1;
          const moves: Record<string, [number, number]> = {
            ArrowDown: [0, -step],
            ArrowLeft: [step, 0],
            ArrowRight: [-step, 0],
            ArrowUp: [0, step],
          };
          const move = moves[event.key];
          if (!move) return;
          event.preventDefault();
          rotate(move[0], move[1]);
        }}
        onPointerCancel={(event) => {
          pointers.current.delete(event.pointerId);
          if (pointers.current.size < 2) pinch.current = null;
          drag.current = null;
        }}
        onPointerDown={(event) => {
          // A tap during a capture scene skips to its end.
          const scene = liveCine(cine.current);
          if (scene) scene.at = Math.min(scene.at, performance.now() / 1000 - CINE_RETURN_AT);
          event.currentTarget.focus({ preventScroll: true });
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          drag.current = {
            startX: event.clientX,
            startY: event.clientY,
            x: event.clientX,
            y: event.clientY,
          };
          dragged.current = false;
        }}
        onPointerMove={(event) => {
          if (pointers.current.has(event.pointerId)) {
            pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          }
          if (pointers.current.size >= 2) {
            // Two fingers: pinch zooms; no square is tapped afterwards.
            const [a, b] = [...pointers.current.values()];
            const gap = Math.hypot(a!.x - b!.x, a!.y - b!.y);
            if (pinch.current !== null && !locked) rotate(0, 0, (pinch.current - gap) * 0.03);
            pinch.current = gap;
            dragged.current = true;
            return;
          }
          if (!drag.current || event.buttons === 0 || locked) return;
          const d = drag.current;
          if (
            !dragged.current &&
            Math.hypot(event.clientX - d.startX, event.clientY - d.startY) < DRAG_THRESHOLD_PX
          )
            return;
          dragged.current = true;
          rotate(-(event.clientX - d.x) * 0.008, -(event.clientY - d.y) * 0.006);
          d.x = event.clientX;
          d.y = event.clientY;
        }}
        onPointerUp={(event) => {
          pointers.current.delete(event.pointerId);
          if (pointers.current.size < 2) pinch.current = null;
          drag.current = null;
        }}
        ref={viewportRef}
        role="application"
        tabIndex={0}
      >
        <Canvas
          camera={{ far: 60, fov: ivory ? 35 : 38, near: 0.1, position: [0, 9, 8] }}
          dpr={lowPerformance ? [1, 1] : [1, 2]}
          flat={ivory}
          gl={{ antialias: true }}
          key={canvasKey}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener('webglcontextlost', (event) => event.preventDefault());
            gl.domElement.addEventListener('webglcontextrestored', () =>
              setCanvasKey((value) => value + 1),
            );
          }}
          shadows
        >
          <Scene
            auras={kiAura ? auras : NO_AURAS}
            checkSquare={checkSquare}
            cine={cine}
            cinema={cinema}
            coordinates={coordinates}
            rims={rims}
            destinations={destinations}
            flip={orientation === 'black'}
            ghosts={ghosts}
            greyLight={greyLightSquares}
            hint={hinted}
            ivory={ivory}
            lastMove={lastMove}
            marks={marks}
            medieval={medieval}
            onPerformance={setLowPerformance}
            onSquare={onSquare}
            pieces={pieces}
            selected={selected}
            squareNames={squareNames}
            view={view}
            walk={Boolean(walk)}
          />
        </Canvas>
        <div className={styles.toastLayer}>
          <MoveToast move={toast} />
        </div>
      </div>
      {promotion ? (
        <div className="dialogBackdrop" role="presentation">
          <div
            aria-labelledby="promotion-title-3d"
            aria-modal="true"
            className="promotionDialog"
            role="dialog"
          >
            <h2 id="promotion-title-3d">Escolha a promoção</h2>
            <div className="promotionChoices">
              {PROMOTION_CHOICES.map(([piece, label]) => (
                <button
                  key={piece}
                  onClick={() => {
                    onMove(`${promotion.from}${promotion.to}${piece}`);
                    setPromotion(null);
                    setSelected(null);
                  }}
                  ref={piece === 'q' ? promotionFocusRef : undefined}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <button className="textButton" onClick={() => setPromotion(null)} type="button">
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
      <div
        aria-label="Controles da câmera 3D"
        className={`${styles.camera} board3dCamera`}
        role="group"
      >
        <button
          aria-pressed={locked}
          aria-label={locked ? 'Destravar a câmera' : 'Travar a câmera neste ângulo'}
          className={`${styles.lock} ${locked ? styles.lockActive : ''}`}
          onClick={toggleLock}
          title={locked ? 'Destravar a câmera' : 'Travar a câmera neste ângulo'}
          type="button"
        >
          <span aria-hidden="true">🔒</span>
        </button>
        <button
          aria-label="Girar para a esquerda"
          disabled={locked}
          onClick={() => rotate(-Math.PI / 8, 0)}
          type="button"
        >
          ⟲
        </button>
        <button
          aria-label="Girar para a direita"
          disabled={locked}
          onClick={() => rotate(Math.PI / 8, 0)}
          type="button"
        >
          ⟳
        </button>
        <button
          aria-label="Inclinar para cima"
          disabled={locked}
          onClick={() => rotate(0, -0.15)}
          type="button"
        >
          ⤒
        </button>
        <button
          aria-label="Inclinar para baixo"
          disabled={locked}
          onClick={() => rotate(0, 0.15)}
          type="button"
        >
          ⤓
        </button>
        <button
          aria-label="Aproximar"
          disabled={locked}
          onClick={() => rotate(0, 0, -1.2)}
          type="button"
        >
          ＋
        </button>
        <button
          aria-label="Afastar"
          disabled={locked}
          onClick={() => rotate(0, 0, 1.2)}
          type="button"
        >
          －
        </button>
        {ivory ? (
          <>
            <button
              aria-pressed={preset === 'imersiva'}
              disabled={locked}
              onClick={() => applyPreset('imersiva')}
              type="button"
            >
              Imersiva
            </button>
            <button
              aria-pressed={preset === 'jogo'}
              disabled={locked}
              onClick={() => applyPreset('jogo')}
              type="button"
            >
              Jogo
            </button>
            <button
              aria-pressed={preset === 'tatica'}
              disabled={locked}
              onClick={() => applyPreset('tatica')}
              type="button"
            >
              Tática
            </button>
          </>
        ) : null}
        <button aria-label="Restaurar visão" disabled={locked} onClick={reset} type="button">
          Restaurar
        </button>
      </div>
    </div>
  );
}
