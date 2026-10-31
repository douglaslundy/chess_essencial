'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { Chess, type Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { BackSide, type Group } from 'three';

import styles from './chess-3d-board.module.css';
import { walkPath, type PlayedMove } from '@/components/game/move-path';
import { MoveToast } from '@/components/game/move-toast';
import { useDialogA11y } from '@/components/ui/dialog-a11y';
import { pieceGeometry } from './piece-geometry';
import { initialPieces, reconcile, type TrackedPiece } from './piece-tracker';

export type Board3DOrientation = 'white' | 'black';

export interface Chess3DBoardProps {
  disabled?: boolean | undefined;
  fen: string;
  lastMove?: { from: string; to: string } | undefined;
  movableColor?: 'w' | 'b' | undefined;
  onMove: (uci: string) => void;
  orientation: Board3DOrientation;
  toast?: PlayedMove | null;
  walk?: PlayedMove | null;
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
// Far enough that the near corners of the board stay inside a square frame on any screen.
const DEFAULT_DISTANCE = 17;

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
}

function PieceMesh({
  captorXZ,
  ghost,
  piece,
  selected,
  walk,
}: {
  captorXZ?: [number, number] | null;
  ghost?: boolean;
  piece: TrackedPiece;
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

  useFrame((state) => {
    const node = group.current;
    if (!node) return;
    const now = state.clock.elapsedTime;
    const a = anim.current;
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
    <group position={home} ref={group} rotation={[0, white ? Math.PI / 2 : -Math.PI / 2, 0]}>
      <mesh castShadow geometry={geometry} receiveShadow>
        <meshStandardMaterial
          color={white ? '#f1e7d0' : '#5a5e72'}
          metalness={white ? 0.15 : 0.3}
          roughness={white ? 0.45 : 0.3}
        />
      </mesh>
      {/* Rim keeps every piece readable (king vs queen vs pawn) against same-tone squares and from
          above: gold around dark pieces, deep bronze around light ones. */}
      <mesh geometry={geometry} scale={[1.06, 1.02, 1.06]}>
        <meshBasicMaterial color={white ? '#7a5326' : '#d8b25a'} side={BackSide} />
      </mesh>
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

/** Eases the camera toward the requested view (spherical coordinates around the board centre). */
function stepCamera(
  rig: Rig,
  camera: {
    lookAt: (x: number, y: number, z: number) => void;
    position: { set: (x: number, y: number, z: number) => void };
  },
  delta: number,
) {
  const { current, target } = rig;
  const k = 1 - Math.exp(-delta * 7);
  current.azimuth += (target.azimuth - current.azimuth) * k;
  current.polar += (target.polar - current.polar) * k;
  current.distance += (target.distance - current.distance) * k;
  const r = current.distance;
  camera.position.set(
    r * Math.sin(current.polar) * Math.sin(current.azimuth),
    r * Math.cos(current.polar),
    r * Math.sin(current.polar) * Math.cos(current.azimuth),
  );
  camera.lookAt(0, 0, 0);
}

function CameraRig({ view }: { view: MutableRefObject<Rig> }) {
  useFrame((state, delta) => stepCamera(view.current, state.camera, delta));
  return null;
}

function BoardSquares({
  destinations,
  lastMove,
  onSquare,
  selected,
}: {
  destinations: Map<string, boolean>;
  lastMove?: { from: string; to: string } | undefined;
  onSquare: (square: Square) => void;
  selected: string | null;
}) {
  const cells = [];
  for (let file = 0; file < 8; file += 1) {
    for (let rank = 1; rank <= 8; rank += 1) {
      const square = `${FILES[file]}${rank}` as Square;
      const [x, z] = squareToXZ(square);
      const light = (file + rank) % 2 === 1;
      const highlighted =
        square === selected || square === lastMove?.from || square === lastMove?.to;
      const destination = destinations.get(square);
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
            <meshStandardMaterial
              color={highlighted ? (light ? '#d9d46a' : '#b9b23a') : light ? '#ead7ae' : '#8f6340'}
              roughness={0.7}
            />
          </mesh>
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
  destinations,
  ghosts,
  lastMove,
  onSquare,
  pieces,
  selected,
  view,
  walk,
}: {
  destinations: Map<string, boolean>;
  ghosts: Ghost[];
  lastMove?: { from: string; to: string } | undefined;
  onSquare: (square: Square) => void;
  pieces: TrackedPiece[];
  selected: string | null;
  view: MutableRefObject<Rig>;
  walk: boolean;
}) {
  return (
    <>
      <color args={['#14110f']} attach="background" />
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
      <CameraRig view={view} />
      <mesh position={[0, -0.27, 0]} receiveShadow>
        <boxGeometry args={[9.4, 0.5, 9.4]} />
        <meshStandardMaterial color="#4a2f1c" roughness={0.6} />
      </mesh>
      <BoardSquares
        destinations={destinations}
        lastMove={lastMove}
        onSquare={onSquare}
        selected={selected}
      />
      {pieces.map((piece) => (
        <group
          key={piece.id}
          onPointerUp={(event) => {
            event.stopPropagation();
            onSquare(piece.square as Square);
          }}
        >
          <PieceMesh piece={piece} selected={piece.square === selected} walk={walk} />
        </group>
      ))}
      {ghosts.map((ghost) => (
        <group key={`ghost-${ghost.key}`}>
          <PieceMesh captorXZ={ghost.captor} ghost piece={ghost.piece} />
          <Burst at={squareToXZ(ghost.piece.square)} />
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
  lastMove,
  movableColor,
  onMove,
  orientation,
  toast = null,
  walk = null,
}: Chess3DBoardProps) {
  const [initial] = useState(() => initialPieces(fen));
  const tracker = useRef(initial);
  const [pieces, setPieces] = useState<TrackedPiece[]>(initial.pieces);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
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
    queueMicrotask(() => {
      setPieces(result.pieces);
      setSelected(null);
      if (result.captures.length > 0) {
        const created = result.captures.map(({ captorId, victim }) => {
          const captor = result.pieces.find((piece) => piece.id === captorId);
          ghostKey.current += 1;
          return {
            captor: captor ? squareToXZ(captor.square) : null,
            key: ghostKey.current,
            piece: victim,
          } satisfies Ghost;
        });
        setGhosts((old) => [...old, ...created]);
        const timer = window.setTimeout(
          () => setGhosts((old) => old.filter((ghost) => !created.includes(ghost))),
          2500,
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
    target.polar = Math.min(Math.max(target.polar + dPolar, 0.15), 1.45);
    target.distance = Math.min(Math.max(target.distance + dDistance, 7), 18);
  }

  function reset() {
    const base = orientation === 'white' ? 0 : Math.PI;
    const target = view.current.target;
    const turns = Math.round((view.current.current.azimuth - base) / (2 * Math.PI));
    target.azimuth = base + turns * 2 * Math.PI;
    target.polar = DEFAULT_POLAR;
    target.distance = DEFAULT_DISTANCE;
  }

  if (!supported) {
    return (
      <p className={styles.fallback} role="status">
        Este dispositivo não suporta o tabuleiro 3D (WebGL). Use o tabuleiro 2D.
      </p>
    );
  }

  const summary = chess
    ? `Tabuleiro 3D. Vez das ${chess.turn() === 'w' ? 'brancas' : 'pretas'}. Use os botões para girar a visão.`
    : 'Tabuleiro 3D';

  return (
    <div className={styles.wrapper}>
      <div
        aria-label={summary}
        className={styles.viewport}
        onPointerCancel={() => (drag.current = null)}
        onPointerDown={(event) => {
          drag.current = {
            startX: event.clientX,
            startY: event.clientY,
            x: event.clientX,
            y: event.clientY,
          };
          dragged.current = false;
        }}
        onPointerMove={(event) => {
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
        onPointerUp={() => (drag.current = null)}
        role="img"
      >
        <Canvas
          camera={{ far: 60, fov: 38, near: 0.1, position: [0, 9, 8] }}
          dpr={[1, 2]}
          gl={{ antialias: true }}
          shadows
        >
          <Scene
            destinations={destinations}
            ghosts={ghosts}
            lastMove={lastMove}
            onSquare={onSquare}
            pieces={pieces}
            selected={selected}
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
      <div aria-label="Controles da câmera 3D" className={styles.camera} role="group">
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
        <button aria-label="Restaurar visão" disabled={locked} onClick={reset} type="button">
          Restaurar
        </button>
      </div>
    </div>
  );
}
