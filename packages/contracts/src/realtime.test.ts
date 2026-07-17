import { describe, expect, it } from 'vitest';

import {
  authenticateCommandSchema,
  drawOfferedEventSchema,
  gameJoinCommandSchema,
  REALTIME_PROTOCOL_VERSION,
  realtimeMoveSubmitSchema,
} from './realtime.js';

describe('realtime contracts', () => {
  it('requires the supported protocol version during authentication', () => {
    expect(
      authenticateCommandSchema.parse({
        accessToken: 'token',
        protocolVersion: REALTIME_PROTOCOL_VERSION,
      }),
    ).toMatchObject({ protocolVersion: 1 });
    expect(() =>
      authenticateCommandSchema.parse({ accessToken: 'token', protocolVersion: 2 }),
    ).toThrow();
  });

  it('validates a typed draw offer event', () => {
    const timestamp = '2026-07-17T03:00:00.000Z';
    expect(
      drawOfferedEventSchema.parse({
        clock: {
          activeClockStartedAt: timestamp,
          blackClockMs: 180000,
          serverNow: timestamp,
          whiteClockMs: 180000,
        },
        offerId: '018f47f4-7b2f-4d90-8a66-a00000000003',
        offeredByUserId: '018f47f4-7b2f-4d90-8a66-a00000000001',
        state: {
          activeClockStartedAt: timestamp,
          blackClockMs: 180000,
          currentFen: 'startpos',
          finishedAt: null,
          id: '018f47f4-7b2f-4d90-8a66-a00000000004',
          players: [],
          result: 'none',
          sideToMove: 'white',
          startedAt: timestamp,
          status: 'active',
          termination: 'none',
          version: 0,
          whiteClockMs: 180000,
        },
      }),
    ).toMatchObject({ offerId: '018f47f4-7b2f-4d90-8a66-a00000000003' });
  });

  it('validates join and idempotent move commands', () => {
    expect(
      gameJoinCommandSchema.parse({
        gameId: '018f47f4-7b2f-4d90-8a66-a00000000001',
        lastKnownVersion: 3,
      }),
    ).toMatchObject({ lastKnownVersion: 3 });
    expect(
      realtimeMoveSubmitSchema.parse({
        clientMoveId: '018f47f4-7b2f-4d90-8a66-a00000000002',
        expectedVersion: 3,
        gameId: '018f47f4-7b2f-4d90-8a66-a00000000001',
        uci: 'E2E4',
      }).uci,
    ).toBe('e2e4');
  });
});
