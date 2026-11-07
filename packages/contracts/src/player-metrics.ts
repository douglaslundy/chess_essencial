import { z } from 'zod';

const qualityCountsSchema = z.object({
  bom: z.number().int().nonnegative(),
  erro: z.number().int().nonnegative(),
  excelente: z.number().int().nonnegative(),
  gafe: z.number().int().nonnegative(),
  imprecisao: z.number().int().nonnegative(),
  missedWin: z.number().int().nonnegative(),
  otimo: z.number().int().nonnegative(),
});

export const playerMetricsSchema = z.object({
  gamesPlayed: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  timePlayedSeconds: z.number().int().nonnegative(),
  /** Games with a finished engine analysis that feed the move quality figures below. */
  analyzedGames: z.number().int().nonnegative(),
  quality: qualityCountsSchema,
  /** Strong points, weak points and an overall summary, written from the figures above. */
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  summary: z.string(),
});
export type PlayerMetrics = z.infer<typeof playerMetricsSchema>;
