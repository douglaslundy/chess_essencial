import { z } from 'zod';

export const libraryResultSchema = z.enum(['1-0', '0-1', '1/2-1/2']);

export const librarySearchQuerySchema = z.object({
  eco: z.string().trim().min(1).max(3).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
  opening: z.string().trim().min(1).max(80).optional(),
  player: z.string().trim().min(1).max(80).optional(),
  q: z.string().trim().min(1).max(80).optional(),
  result: libraryResultSchema.optional(),
  yearFrom: z.coerce.number().int().min(1400).max(2100).optional(),
  yearTo: z.coerce.number().int().min(1400).max(2100).optional(),
});
export type LibrarySearchQuery = z.infer<typeof librarySearchQuerySchema>;

export const libraryGameSummarySchema = z.object({
  black: z.string(),
  blackElo: z.number().int().nullable(),
  eco: z.string().nullable(),
  event: z.string().nullable(),
  id: z.string().uuid(),
  openingFamily: z.string().nullable(),
  openingName: z.string().nullable(),
  playedOn: z.string().nullable(),
  plyCount: z.number().int(),
  result: libraryResultSchema,
  white: z.string(),
  whiteElo: z.number().int().nullable(),
});
export type LibraryGameSummary = z.infer<typeof libraryGameSummarySchema>;

export const libraryGameSchema = libraryGameSummarySchema.extend({
  movesSan: z.array(z.string()),
  round: z.string().nullable(),
  site: z.string().nullable(),
});
export type LibraryGame = z.infer<typeof libraryGameSchema>;

export const librarySearchResultSchema = z.object({
  items: z.array(libraryGameSummarySchema),
  total: z.number().int(),
});
export type LibrarySearchResult = z.infer<typeof librarySearchResultSchema>;

export const libraryFacetsSchema = z.object({
  openings: z.array(z.object({ count: z.number().int(), name: z.string() })),
  players: z.array(z.object({ count: z.number().int(), name: z.string() })),
});
export type LibraryFacets = z.infer<typeof libraryFacetsSchema>;

/** Uma entrada de revisão por lance (ply 1 = primeiro lance das brancas). */
export const libraryReviewEntrySchema = z.object({
  better: z.string().nullable(),
  betterWhy: z.string().nullable(),
  expect: z.string().nullable(),
  ply: z.number().int().positive(),
  strength: z.string().nullable(),
  summary: z.string(),
  weakness: z.string().nullable(),
  why: z.string(),
});
export type LibraryReviewEntry = z.infer<typeof libraryReviewEntrySchema>;

export const libraryReviewSchema = z.object({
  aiAvailable: z.boolean(),
  entries: z.array(libraryReviewEntrySchema),
  status: z.enum(['none', 'generating', 'completed', 'failed']),
  totalPlies: z.number().int(),
});
export type LibraryReview = z.infer<typeof libraryReviewSchema>;
