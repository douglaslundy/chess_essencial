import { z } from 'zod';

export const openingSideSchema = z.enum(['white', 'black']);

export const openingLineSchema = z.object({
  /** Games of the study library that reached this line: how often it is played. */
  games: z.number().int().nonnegative().optional(),
  eco: z.string(),
  family: z.string(),
  id: z.string().uuid(),
  name: z.string(),
  pgn: z.string(),
  plyCount: z.number().int().positive(),
  side: openingSideSchema,
  /** Moves in SAN, in order (white first). */
  moves: z.array(z.string()),
  /** Traps only: what the trapper is setting up and how the opponent falls for it. */
  trapIdea: z.string().optional(),
  /** Traps only: 1 is the most effective (fastest finish). */
  trapRank: z.number().int().positive().optional(),
});
export const openingKindSchema = z.enum(['opening', 'trap']);
export type OpeningKind = z.infer<typeof openingKindSchema>;
export type OpeningLine = z.infer<typeof openingLineSchema>;

export const openingFamilySchema = z.object({
  family: z.string(),
  /** Games of the study library in this family: how often it is played. */
  games: z.number().int().nonnegative(),
  lines: z.number().int().nonnegative(),
  side: openingSideSchema,
  /** The family's base line: opening it enters the opening. */
  startId: z.string().uuid(),
});
export type OpeningFamily = z.infer<typeof openingFamilySchema>;

export const openingLessonSchema = z.object({
  frames: z.array(z.object({ index: z.number().int(), label: z.string(), text: z.string() })),
  overview: z.string(),
  /** True once an administrator has reviewed (and possibly corrected) the text. */
  reviewed: z.boolean().optional(),
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

export const adminOpeningLessonSchema = z.object({
  eco: z.string(),
  family: z.string(),
  name: z.string(),
  openingId: z.string().uuid(),
  overview: z.string(),
  reviewed: z.boolean(),
  status: z.enum(['generating', 'completed', 'failed']),
});
export type AdminOpeningLesson = z.infer<typeof adminOpeningLessonSchema>;

export const adminOpeningLessonInputSchema = z.object({
  frames: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        label: z.string().max(200),
        text: z.string().trim().min(1).max(900),
      }),
    )
    .max(200),
  overview: z.string().trim().max(1200),
  reviewed: z.boolean(),
});
export type AdminOpeningLessonInput = z.infer<typeof adminOpeningLessonInputSchema>;
