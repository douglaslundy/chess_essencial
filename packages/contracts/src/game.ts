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
  coachMode: z.boolean(),
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
  pendingDrawOffer: z
    .object({
      offerId: z.string().uuid(),
      offeredByUserId: z.string().uuid(),
      createdAt: z.string().datetime(),
    })
    .nullable(),
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
  coachMode: z.boolean(),
  color: z.enum(['white', 'black']),
  finishedAt: z.string().datetime().nullable(),
  id: z.string().uuid(),
  opponent: z.object({
    avatarUrl: z.string().nullable(),
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

export const moveQualitySchema = z.enum([
  'otimo',
  'excelente',
  'bom',
  'imprecisao',
  'erro',
  'gafe',
]);

export const gameMoveAnalysisSchema = z.object({
  ply: z.number().int().positive(),
  color: z.enum(['white', 'black']),
  san: z.string(),
  uci: z.string(),
  scoreBeforeCp: z.number().int().nullable(),
  mateBefore: z.number().int().nullable(),
  scoreAfterCp: z.number().int().nullable(),
  mateAfter: z.number().int().nullable(),
  bestMoveUci: z.string().nullable(),
  centipawnLoss: z.number().int(),
  quality: moveQualitySchema,
  missedWin: z.boolean(),
});

export const gameAnalysisQualityCountsSchema = z.object({
  otimo: z.number().int().nonnegative(),
  excelente: z.number().int().nonnegative(),
  bom: z.number().int().nonnegative(),
  imprecisao: z.number().int().nonnegative(),
  erro: z.number().int().nonnegative(),
  gafe: z.number().int().nonnegative(),
  missedWin: z.number().int().nonnegative(),
});

export const gameErrorSignalSchema = z.object({
  id: z.string().uuid(),
  ply: z.number().int().positive(),
  skillKey: z.string(),
  skillLabel: z.string(),
  taxonomyVersion: z.number().int().positive(),
  signalType: z.enum(['missed_opportunity', 'unsafe_move']),
  confidence: z.number().min(0).max(1),
  ruleVersion: z.string(),
  evidence: z.object({
    centipawnLoss: z.number().int(),
    missedWin: z.boolean(),
    quality: moveQualitySchema,
  }),
  recommendation: z
    .object({
      exerciseId: z.string().uuid(),
      exerciseTitle: z.string(),
      rationale: z.string(),
    })
    .nullable(),
});

export const gameAnalysisSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  summary: z
    .object({ white: gameAnalysisQualityCountsSchema, black: gameAnalysisQualityCountsSchema })
    .nullable(),
  moves: z.array(gameMoveAnalysisSchema),
  errorSignals: z.array(gameErrorSignalSchema),
});

export const gameNarrationKeyMomentSchema = z.object({
  ply: z.number().int().positive(),
  color: z.enum(['white', 'black']),
  san: z.string(),
  quality: moveQualitySchema,
  narrative: z.string(),
});

export const gameNarrationSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  summary: z.string().nullable(),
  keyMoments: z.array(gameNarrationKeyMomentSchema),
  patterns: z.array(z.string()),
  studyPlan: z.array(z.string()),
});

// Live, in-game AI narration (Treinador): enriches the existing
// template-based suggestion/quality-warning speech with an LLM-written
// version, same "motor calcula, LLM só narra" architecture as the
// post-game review narration above - the client keeps speaking the
// instant template and swaps to this once it arrives (never blocks play).
export const liveNarrationRequestSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('suggestion'),
    fen: z.string(),
    bestMoveUci: z.string(),
    mate: z.number().int().nullable(),
    scoreCp: z.number().int().nullable(),
  }),
  z.object({
    kind: z.literal('quality'),
    fen: z.string(),
    uci: z.string(),
    bestMoveUci: z.string().nullable(),
    quality: moveQualitySchema,
    centipawnLoss: z.number().int(),
    missedWin: z.boolean(),
  }),
]);

export const liveNarrationResultSchema = z.object({
  // null whenever no AI provider is configured, the plan doesn't include
  // it, or the call failed for any reason - the frontend just keeps
  // whatever template text it already showed/spoke, silently.
  narrative: z.string().nullable(),
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
export type MoveQuality = z.infer<typeof moveQualitySchema>;
export type GameMoveAnalysis = z.infer<typeof gameMoveAnalysisSchema>;
export type GameAnalysisQualityCounts = z.infer<typeof gameAnalysisQualityCountsSchema>;
export type GameAnalysis = z.infer<typeof gameAnalysisSchema>;
export type GameErrorSignal = z.infer<typeof gameErrorSignalSchema>;
export type GameNarrationKeyMoment = z.infer<typeof gameNarrationKeyMomentSchema>;
export type GameNarration = z.infer<typeof gameNarrationSchema>;
export type LiveNarrationRequest = z.infer<typeof liveNarrationRequestSchema>;
export type LiveNarrationResult = z.infer<typeof liveNarrationResultSchema>;
