import { z } from 'zod';

export const openingSideSchema = z.enum(['white', 'black']);

export const openingLineSchema = z.object({
  eco: z.string(),
  family: z.string(),
  id: z.string().uuid(),
  name: z.string(),
  pgn: z.string(),
  plyCount: z.number().int().positive(),
  side: openingSideSchema,
  /** Moves in SAN, in order (white first). */
  moves: z.array(z.string()),
});
export type OpeningLine = z.infer<typeof openingLineSchema>;

export const openingFamilySchema = z.object({
  family: z.string(),
  lines: z.number().int().nonnegative(),
  side: openingSideSchema,
});
export type OpeningFamily = z.infer<typeof openingFamilySchema>;

export const openingLessonSchema = z.object({
  frames: z.array(z.object({ index: z.number().int(), label: z.string(), text: z.string() })),
  overview: z.string(),
  status: z.enum(['none', 'generating', 'completed', 'failed']),
});
export type OpeningLesson = z.infer<typeof openingLessonSchema>;

export const openingDetailSchema = z.object({
  /** True when the AI can write the lesson (a provider is configured). */
  aiAvailable: z.boolean(),
  dueAt: z.string().nullable(),
  lesson: openingLessonSchema,
  line: openingLineSchema,
});
export type OpeningDetail = z.infer<typeof openingDetailSchema>;

/** A move the opening book has after a given position, with the shortest named line that plays it. */
export const openingBranchSchema = z.object({
  lines: z.number().int().positive(),
  name: z.string(),
  openingId: z.string().uuid(),
  uci: z.string(),
});
export type OpeningBranch = z.infer<typeof openingBranchSchema>;

export const openingPracticeInputSchema = z.object({ correct: z.boolean() });
