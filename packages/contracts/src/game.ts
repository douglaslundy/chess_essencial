import { z } from 'zod';

import { timeControlCodeSchema } from './matchmaking.js';

export const createGameInputSchema = z.object({
  opponentUserId: z.string().uuid(),
  timeControlCode: timeControlCodeSchema,
  creatorColor: z.enum(['white', 'black']).default('white'),
});

export const submitMoveInputSchema = z.object({
  clientMoveId: z.string().uuid(),
  expectedVersion: z.number().int().nonnegative(),
  uci: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/),
});

export const gameStateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['created', 'waiting', 'active', 'finished', 'aborted']),
  result: z.enum(['white_win', 'black_win', 'draw', 'none']),
  termination: z.enum([
    'checkmate',
    'resignation',
    'timeout',
    'stalemate',
    'repetition',
    'fifty_move',
    'insufficient_material',
    'agreement',
    'abandonment',
    'admin',
    'none',
  ]),
  currentFen: z.string(),
  sideToMove: z.enum(['white', 'black']),
  version: z.number().int().nonnegative(),
  whiteClockMs: z.number().int().nonnegative(),
  blackClockMs: z.number().int().nonnegative(),
  activeClockStartedAt: z.string().datetime().nullable(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  players: z.array(
    z.object({
      userId: z.string().uuid(),
      username: z.string(),
      displayName: z.string(),
      avatarUrl: z.string().nullable(),
      color: z.enum(['white', 'black']),
      ratingBefore: z.number().int(),
    }),
  ),
});

export const gameMoveSchema = z.object({
  id: z.number().int().positive(),
  ply: z.number().int().positive(),
  color: z.enum(['white', 'black']),
  clientMoveId: z.string().uuid(),
  uci: z.string(),
  san: z.string(),
  from: z.string().length(2),
  to: z.string().length(2),
  promotion: z.string().nullable(),
  fenBefore: z.string(),
  fenAfter: z.string(),
  flags: z.object({
    capture: z.boolean(),
    castling: z.enum(['king_side', 'queen_side']).nullable(),
    enPassant: z.boolean(),
    promotion: z.boolean(),
  }),
  committedAt: z.string().datetime(),
});

export const gameHistoryQuerySchema = z.object({
  color: z.enum(['white', 'black']).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  page: z.coerce.number().int().min(1).default(1),
  pool: z.enum(['bullet', 'blitz', 'rapid', 'classical', 'correspondence']).optional(),
  rated: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  result: z.enum(['white_win', 'black_win', 'draw', 'none']).optional(),
  status: z.enum(['created', 'waiting', 'active', 'finished', 'aborted']).optional(),
});

export const gameHistoryItemSchema = z.object({
  color: z.enum(['white', 'black']),
  finishedAt: z.string().datetime().nullable(),
  id: z.string().uuid(),
  opponent: z.object({
    displayName: z.string(),
    rating: z.number().int(),
    userId: z.string().uuid(),
    username: z.string(),
  }),
  pool: z.enum(['bullet', 'blitz', 'rapid', 'classical', 'correspondence']),
  rated: z.boolean(),
  result: z.enum(['white_win', 'black_win', 'draw', 'none']),
  startedAt: z.string().datetime().nullable(),
  status: z.enum(['created', 'waiting', 'active', 'finished', 'aborted']),
  termination: z.string(),
  timeControl: z.string(),
});

export const gameHistoryPageSchema = z.object({
  items: z.array(gameHistoryItemSchema),
  limit: z.number().int(),
  page: z.number().int(),
  total: z.number().int().nonnegative(),
});

export const reviewAnnotationInputSchema = z.object({
  arrows: z
    .array(
      z.object({
        color: z.string().max(20).default('gold'),
        from: z.string().regex(/^[a-h][1-8]$/),
        to: z.string().regex(/^[a-h][1-8]$/),
      }),
    )
    .max(32)
    .default([]),
  comment: z.string().trim().max(2000).nullable().default(null),
  highlights: z
    .array(
      z.object({
        color: z.string().max(20).default('gold'),
        square: z.string().regex(/^[a-h][1-8]$/),
      }),
    )
    .max(32)
    .default([]),
  ply: z.number().int().nonnegative(),
});

export const reviewAnnotationSchema = reviewAnnotationInputSchema.extend({
  gameId: z.string().uuid(),
  updatedAt: z.string().datetime(),
  userId: z.string().uuid(),
});

export const drawOfferActionSchema = z.object({
  accepted: z.boolean(),
  offerId: z.string().uuid(),
  state: gameStateSchema,
});

export type CreateGameInput = z.infer<typeof createGameInputSchema>;
export type GameHistoryItem = z.infer<typeof gameHistoryItemSchema>;
export type GameHistoryPage = z.infer<typeof gameHistoryPageSchema>;
export type GameHistoryQuery = z.infer<typeof gameHistoryQuerySchema>;
export type ReviewAnnotation = z.infer<typeof reviewAnnotationSchema>;
export type ReviewAnnotationInput = z.infer<typeof reviewAnnotationInputSchema>;
export type SubmitMoveInput = z.infer<typeof submitMoveInputSchema>;
export type GameState = z.infer<typeof gameStateSchema>;
export type GameMove = z.infer<typeof gameMoveSchema>;
export type DrawOfferAction = z.infer<typeof drawOfferActionSchema>;
