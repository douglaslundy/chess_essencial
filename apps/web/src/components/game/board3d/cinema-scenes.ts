import type { PieceKind } from './piece-geometry';

/**
 * Capture scenes of the "Medieval Cinema" board, as pure functions of the scene time (seconds):
 * the camera shot, the capturing figure's pose and the victim's fate. Rendering lives elsewhere.
 */
export const CINE_TOTAL = 5.6;
/** The victim is destroyed at this instant in every scene. */
export const CINE_IMPACT = 3.4;
/** From here on the capturing piece steps onto its square and the camera goes back to the game. */
export const CINE_RETURN_AT = 4.9;
/** The other pieces leave the board between these instants. */
export const CINE_HIDE_FROM = 0.3;
export const CINE_HIDE_TO = CINE_RETURN_AT + 0.1;

type XZ = [number, number];

export interface Cine {
  /** Start, in `performance.now() / 1000` seconds. */
  at: number;
  attacker: PieceKind;
  captorId: number;
  /** Unit vector from the capturing piece to the victim. */
  dir: XZ;
  /** Square where the capturing piece ends (differs from `to` only in en passant). */
  end: XZ;
  from: XZ;
  /** Which side of the duel the camera stops on: 1 or -1. */
  side: number;
  /** Where the capturing piece stands during the scene. */
  stage: XZ;
  to: XZ;
  victimId: number;
  victimWhite: boolean;
  /** Heading of the capturing piece while it faces the victim. */
  yaw: number;
}

/** The scene while it is still playing; a finished one stays in its ref until the next capture. */
export function liveCine(cine: Cine | null) {
  return cine && performance.now() / 1000 - cine.at <= CINE_TOTAL ? cine : null;
}

export interface Pose {
  armL: number;
  armR: number;
  /** Forward lean of the torso (negative on the horse: it rears). */
  bow: number;
  elbowL: number;
  elbowR: number;
  /** Angle of the weapon in the right hand: 0 points along the arm, PI points back past the shoulder. */
  grip: number;
}

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
export const smooth = (v: number) => v * v * (3 - 2 * v);
export const span = (t: number, from: number, to: number) => clamp01((t - from) / (to - from));
const ramp = (t: number, from: number, to: number) => smooth(span(t, from, to));
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
/** Rises between `from` and `peak`, falls between `peak` and `to`. */
const bump = (t: number, from: number, peak: number, to: number) =>
  ramp(t, from, peak) * (1 - ramp(t, peak, to));

/** Distance kept from the victim: spell casters stand back, sword and spear come close. */
const STAGE_DISTANCE: Record<PieceKind, number> = {
  b: 1.7,
  k: 0.85,
  n: 2.4,
  p: 0.85,
  q: 1.7,
  r: 2.2,
};

export function stageFor(from: XZ, to: XZ, attacker: PieceKind) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dx, dz) || 1;
  const dir: XZ = [dx / length, dz / length];
  const distance = Math.min(STAGE_DISTANCE[attacker], length);
  const stage: XZ = [to[0] - dir[0] * distance, to[1] - dir[1] * distance];
  // A figure's front is +x before its own heading is applied.
  return { dir, stage, yaw: Math.atan2(-dir[1], dir[0]) };
}

/** Weapons are vertical at rest: sword tip on the ground, staff and spear head up. */
export const REST_POSE: Record<PieceKind, Pose> = {
  b: { armL: 0.5, armR: 0.4, bow: 0, elbowL: 1.3, elbowR: 0, grip: Math.PI - 0.4 },
  k: { armL: 0.3, armR: 0.1, bow: 0, elbowL: 1, elbowR: 0, grip: -0.1 },
  n: { armL: 0, armR: 0, bow: 0, elbowL: 0, elbowR: 0, grip: 0 },
  p: { armL: 0.2, armR: 0.3, bow: 0, elbowL: 0.5, elbowR: 0, grip: Math.PI - 0.3 },
  q: { armL: 0.45, armR: 0.45, bow: 0, elbowL: 1.1, elbowR: 1.1, grip: 0 },
  r: { armL: 0, armR: 0, bow: 0, elbowL: 0, elbowR: 0, grip: 0 },
};

/** Pose of the capturing figure. Every scene ends with a bow towards the fallen piece. */
export function actorPose(kind: PieceKind, t: number): Pose {
  const rest = REST_POSE[kind];
  const bow = bump(t, 4, 4.45, 4.9) * 0.75;
  if (kind === 'q') {
    // Hands out towards the victim, then up: the victim rises with them.
    const extend = ramp(t, 1.2, 1.9);
    const lift = ramp(t, 1.9, 2.8);
    const drop = ramp(t, 3.5, 4);
    const arm = mix(mix(rest.armL, 1.45, extend) + lift * 0.9, rest.armL, drop);
    const elbow = mix(mix(rest.elbowL, 0.1, extend), rest.elbowL, drop);
    return { armL: arm, armR: arm, bow, elbowL: elbow, elbowR: elbow, grip: 0 };
  }
  if (kind === 'k') {
    // Sword raised overhead, then brought down.
    const strike = span(t, 3.25, CINE_IMPACT) ** 2;
    const raised = mix(mix(rest.armR, 2.9, ramp(t, 1.4, 2.4)), 1.1, strike);
    return { ...rest, armR: mix(raised, rest.armR, ramp(t, 3.7, 4.1)), bow };
  }
  if (kind === 'b') {
    // Staff lifted to the sky; it stays upright while the arm goes up.
    const armR = mix(rest.armR, 2, ramp(t, 1.4, 2.2) * (1 - ramp(t, 3.6, 4)));
    return { ...rest, armR, bow, grip: Math.PI - armR };
  }
  if (kind === 'p') {
    // Spear levelled and drawn back, then thrust.
    const lower = ramp(t, 3.7, 4.1);
    const level = ramp(t, 1.5, 2.4) * (1 - lower);
    const thrust = span(t, 3.2, CINE_IMPACT) ** 2;
    const armR = mix(mix(mix(rest.armR, -0.5, level), 1.2, thrust), rest.armR, lower);
    return { ...rest, armR, bow, grip: mix(Math.PI, Math.PI / 2, level) - armR };
  }
  if (kind === 'n') {
    // Rears before the charge and again over the rubble.
    return { ...rest, bow: -0.6 * bump(t, 1.4, 2, 2.8) - 0.5 * bump(t, 4, 4.4, 4.9) };
  }
  return rest;
}

/** Where the capturing piece is: `approach` runs origin -> stage, `advance` runs stage -> square. */
export function captorMotion(kind: PieceKind, t: number) {
  return {
    // The horse runs the victim down; everyone else walks in after the scene.
    advance:
      kind === 'n' ? ramp(t, 3, CINE_IMPACT + 0.05) : ramp(t, CINE_RETURN_AT, CINE_TOTAL - 0.1),
    approach: ramp(t, 0, 0.6),
    face: ramp(t, 0, 0.5) * (1 - ramp(t, CINE_RETURN_AT, CINE_TOTAL)),
    lift: kind === 'r' ? bump(t, 4, 4.3, 4.6) * 0.3 : 0,
  };
}

/** The victim before it shatters: `y` height, `spin`/`wobble` rotation, `shake` tremble amplitude. */
export function victimState(attacker: PieceKind, t: number) {
  if (attacker === 'q') {
    const lift = ramp(t, 1.9, 2.8);
    return {
      shake: span(t, 2.6, CINE_IMPACT) * 0.05,
      spin: lift * Math.max(t - 1.9, 0) * 1.2,
      visible: t < CINE_IMPACT,
      wobble: Math.sin(t * 2.2) * 0.25 * lift,
      y: lift + Math.sin(t * 3) * 0.05 * lift,
    };
  }
  if (attacker === 'p') {
    // Speared: it cracks and sinks into rubble instead of bursting at once.
    const fall = span(t, CINE_IMPACT, CINE_IMPACT + 0.5) ** 2;
    return {
      shake: span(t, 2.6, CINE_IMPACT) * 0.02 + (t > CINE_IMPACT ? 0.04 : 0),
      spin: 0,
      visible: t < CINE_IMPACT + 0.5,
      wobble: fall * 0.5,
      y: -fall * 0.9,
    };
  }
  const from = attacker === 'r' ? 3 : attacker === 'b' ? 2.6 : 2.2;
  return {
    shake: span(t, from, CINE_IMPACT) * (attacker === 'b' ? 0.06 : 0.025),
    spin: 0,
    visible: t < CINE_IMPACT,
    wobble: 0,
    y: 0,
  };
}

/**
 * The shot: starts behind the capturing piece, swings a quarter turn and stops beside the duel.
 * `weight` blends it with the game camera (0 = game view) so the scene opens and closes smoothly.
 */
export function cineCamera(
  cine: Pick<Cine, 'attacker' | 'dir' | 'side' | 'stage' | 'to'>,
  t: number,
) {
  const { dir, side, stage, to } = cine;
  // Follows a victim that is lifted off the board, so it never leaves the frame.
  const rise = victimState(cine.attacker, Math.min(t, CINE_IMPACT)).y;
  const turn = ramp(t, 0.3, 1.9);
  const angle = (Math.PI / 2) * turn;
  const distance = Math.hypot(to[0] - stage[0], to[1] - stage[1]);
  // Starts over the attacker's shoulder and settles on the middle of the duel, then pushes in.
  const cx = mix(stage[0], (stage[0] + to[0]) / 2, turn);
  const cz = mix(stage[1], (stage[1] + to[1]) / 2, turn);
  const radius =
    (3.7 + distance * 0.5 + rise * 0.6) *
    mix(0.75, 1, turn) *
    (1 - 0.1 * span(t, 1.9, CINE_IMPACT));
  const back = -Math.cos(angle) * radius;
  const beside = Math.sin(angle) * radius * side;
  const quake = t > CINE_IMPACT ? (1 - span(t, CINE_IMPACT, CINE_IMPACT + 0.4)) * 0.06 : 0;
  return {
    look: [cx, 0.8 + rise * 0.45, cz] as [number, number, number],
    pos: [
      cx + dir[0] * back - dir[1] * beside + Math.sin(t * 90) * quake,
      mix(1.9, 1.1, turn) + Math.cos(t * 70) * quake,
      cz + dir[1] * back + dir[0] * beside,
    ] as [number, number, number],
    weight: ramp(t, 0, 0.35) * (1 - ramp(t, CINE_RETURN_AT, CINE_TOTAL)),
  };
}
