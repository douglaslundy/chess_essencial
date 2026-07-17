import { z } from 'zod';

export const createGameInputSchema = z.object({
  opponentUserId: z.string().uuid(),
  timeControlCode: z.string().trim().min(1).max(40),
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

export type CreateGameInput = z.infer<typeof createGameInputSchema>;
export type SubmitMoveInput = z.infer<typeof submitMoveInputSchema>;
export type GameState = z.infer<typeof gameStateSchema>;
export type GameMove = z.infer<typeof gameMoveSchema>;
