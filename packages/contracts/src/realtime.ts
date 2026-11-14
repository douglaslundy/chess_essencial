import { z } from 'zod';

import { gameMoveSchema, gameStateSchema, submitMoveInputSchema } from './game.js';

export const REALTIME_PROTOCOL_VERSION = 1 as const;

export const realtimeEnvelopeSchema = z.object({
  event: z.string().min(1),
  data: z.unknown(),
});

export const authenticateCommandSchema = z.object({
  protocolVersion: z.literal(REALTIME_PROTOCOL_VERSION),
  accessToken: z.string().min(1),
});

export const authenticatedEventSchema = z.object({
  protocolVersion: z.literal(REALTIME_PROTOCOL_VERSION),
});

export const gameJoinCommandSchema = z.object({
  gameId: z.string().uuid(),
  lastKnownVersion: z.number().int().nonnegative(),
});

export const realtimeMoveSubmitSchema = submitMoveInputSchema.extend({
  gameId: z.string().uuid(),
});

/** A player's capture film started (`playing`) or is over (ended, skipped or failed). */
export const captureFilmCommandSchema = z.object({
  gameId: z.string().uuid(),
  playing: z.boolean(),
  /** Ply of the capture the film shows. */
  ply: z.number().int().positive(),
});

export const realtimeClockSchema = z.object({
  activeClockStartedAt: z.string().datetime().nullable(),
  blackClockMs: z.number().int().nonnegative(),
  serverNow: z.string().datetime(),
  whiteClockMs: z.number().int().nonnegative(),
});

export const gameSnapshotEventSchema = z.object({
  clock: realtimeClockSchema,
  moves: z.array(gameMoveSchema),
  state: gameStateSchema,
});

export const moveCommittedEventSchema = z.object({
  clock: realtimeClockSchema,
  move: gameMoveSchema,
  state: gameStateSchema,
});

export const clockUpdatedEventSchema = z.object({
  clock: realtimeClockSchema,
  state: gameStateSchema,
});

export const drawOfferedEventSchema = z.object({
  clock: realtimeClockSchema,
  offerId: z.string().uuid(),
  offeredByUserId: z.string().uuid(),
  state: gameStateSchema,
});

export const realtimeProblemSchema = z.object({
  detail: z.string(),
  event: z.string(),
  status: z.number().int().min(400).max(599),
});

export type AuthenticateCommand = z.infer<typeof authenticateCommandSchema>;
export type AuthenticatedEvent = z.infer<typeof authenticatedEventSchema>;
export type CaptureFilmCommand = z.infer<typeof captureFilmCommandSchema>;
export type ClockUpdatedEvent = z.infer<typeof clockUpdatedEventSchema>;
export type DrawOfferedEvent = z.infer<typeof drawOfferedEventSchema>;
export type GameJoinCommand = z.infer<typeof gameJoinCommandSchema>;
export type RealtimeClock = z.infer<typeof realtimeClockSchema>;
export type RealtimeMoveSubmit = z.infer<typeof realtimeMoveSubmitSchema>;
export type RealtimeProblem = z.infer<typeof realtimeProblemSchema>;
