import { z } from 'zod';

import { ratingPoolSchema } from './matchmaking.js';

export const ratingProfileSchema = z.object({
  pool: ratingPoolSchema,
  rating: z.number().int(),
  gamesCount: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  peakRating: z.number().int(),
  provisional: z.boolean(),
});

export const ratingHistoryEntrySchema = z.object({
  id: z.string().uuid(),
  gameId: z.string().uuid(),
  pool: ratingPoolSchema,
  ratingBefore: z.number().int(),
  opponentRating: z.number().int(),
  expectedScore: z.number(),
  actualScore: z.number(),
  kFactor: z.number().int(),
  rawDelta: z.number(),
  delta: z.number().int(),
  ratingAfter: z.number().int(),
  transactionType: z.enum(['game', 'reversal']),
  createdAt: z.string().datetime(),
});

export const leaderboardEntrySchema = z.object({
  rank: z.number().int().positive(),
  userId: z.string().uuid(),
  username: z.string(),
  displayName: z.string(),
  rating: z.number().int(),
  gamesCount: z.number().int().nonnegative(),
  provisional: z.boolean(),
});

export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
export type RatingHistoryEntry = z.infer<typeof ratingHistoryEntrySchema>;
export type RatingProfile = z.infer<typeof ratingProfileSchema>;
