import { describe, expect, it } from 'vitest';

import {
  CINE_IMPACT,
  CINE_TOTAL,
  REST_POSE,
  actorPose,
  captorMotion,
  cineCamera,
  stageFor,
  victimState,
} from './cinema-scenes';
import { attackingSquares, nextAuraSquares } from './piece-attacks';

describe('capture scene', () => {
  const from: [number, number] = [0, 3];
  const to: [number, number] = [0, -2];
  const staged = stageFor(from, to, 'q');
  const cine = { ...staged, attacker: 'q' as const, side: 1, to };

  it('stages the attacker between its origin and the victim, never behind the origin', () => {
    expect(staged.stage[1]).toBeCloseTo(-0.3);
    expect(stageFor([0, -1], to, 'q').stage).toEqual([0, -1]);
  });

  it('opens and closes on the game camera', () => {
    expect(cineCamera(cine, 0).weight).toBe(0);
    expect(cineCamera(cine, CINE_TOTAL).weight).toBe(0);
    expect(cineCamera(cine, 2.5).weight).toBe(1);
  });

  it('starts behind the attacker and stops beside the duel', () => {
    const start = cineCamera(cine, 0.3);
    // dir is (0, -1): "behind" is +z of the look point.
    expect(start.pos[2] - start.look[2]).toBeGreaterThan(2);
    expect(Math.abs(start.pos[0] - start.look[0])).toBeLessThan(0.01);
    const end = cineCamera(cine, 2);
    expect(Math.abs(end.pos[2] - end.look[2])).toBeLessThan(0.01);
    expect(Math.abs(end.pos[0] - end.look[0])).toBeGreaterThan(2);
  });

  it('queen: hands out, then up with the victim, then a bow', () => {
    expect(actorPose('q', 0)).toEqual(REST_POSE.q);
    const out = actorPose('q', 1.9);
    expect(out.armL).toBeCloseTo(1.45);
    expect(victimState('q', 1.9).y).toBeCloseTo(0);
    expect(actorPose('q', 2.8).armL).toBeGreaterThan(2.2);
    expect(victimState('q', 2.8).y).toBeGreaterThan(0.8);
    expect(actorPose('q', 4.45).bow).toBeGreaterThan(0.7);
    expect(actorPose('q', CINE_TOTAL).bow).toBe(0);
  });

  it('destroys the victim at the impact and only then walks onto its square', () => {
    expect(victimState('q', CINE_IMPACT - 0.01).visible).toBe(true);
    expect(victimState('q', CINE_IMPACT + 0.01).visible).toBe(false);
    expect(captorMotion('q', CINE_IMPACT).advance).toBe(0);
    expect(captorMotion('q', CINE_TOTAL).advance).toBe(1);
    // The horse is the exception: it runs the victim down.
    expect(captorMotion('n', CINE_IMPACT + 0.05).advance).toBe(1);
  });

  it('keeps weapons upright while the bishop raises the staff', () => {
    for (const t of [0, 1.8, 3]) {
      const pose = actorPose('b', t);
      expect(pose.armR + pose.grip).toBeCloseTo(Math.PI);
    }
  });
});

describe('attackingSquares', () => {
  it('lists the pieces that attack an enemy piece', () => {
    // White queen d1 attacks the pawn on d7; the black pawn attacks nothing.
    const attacking = attackingSquares('4k3/3p4/8/8/8/8/8/3QK3 w - - 0 1');
    expect([...attacking]).toEqual(['d1']);
  });

  it('is empty in the starting position', () => {
    expect(attackingSquares('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1').size).toBe(
      0,
    );
  });
});

describe('nextAuraSquares', () => {
  it('lights the piece that moved into an attack and keeps it while it attacks', () => {
    const moved = nextAuraSquares(new Set(), '4k3/3p4/8/8/8/8/8/3QK3 b - - 0 1', {
      from: 'c1',
      to: 'd1',
    });
    expect([...moved]).toEqual(['d1']);
    const kept = nextAuraSquares(moved, '5k2/3p4/8/8/8/8/8/3QK3 w - - 0 1', {
      from: 'e8',
      to: 'f8',
    });
    expect([...kept]).toEqual(['d1']);
    expect(nextAuraSquares(kept, '5k2/8/8/3p4/8/8/8/2Q1K3 b - - 0 1', null).size).toBe(0);
  });
});
