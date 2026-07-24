import { z } from 'zod';

export const startLessonAttemptInputSchema = z.object({
  lessonId: z.string().uuid(),
});

export const lessonActionInputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('continue') }),
  z.object({
    type: z.literal('move'),
    uci: z
      .string()
      .regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/i)
      .transform((value) => value.toLowerCase()),
  }),
  z.object({ type: z.literal('answer'), value: z.union([z.string(), z.number(), z.boolean()]) }),
]);

export const publicLessonStepSchema = z.object({
  bodyMd: z.string(),
  initialFen: z.string().nullable(),
  orientation: z.enum(['white', 'black']).nullable(),
  stepKey: z.string(),
  stepType: z.enum(['text', 'board_instruction', 'quiz', 'explanation', 'checkpoint', 'summary']),
  title: z.string().nullable(),
});

export const lessonOverviewSchema = z.object({
  courseSlug: z.string(),
  estimatedMinutes: z.number().int().positive(),
  firstStep: publicLessonStepSchema,
  lessonId: z.string().uuid(),
  module: z.number().int().min(1).max(10),
  nextLessonId: z.string().uuid().nullable(),
  previousLessonId: z.string().uuid().nullable(),
  title: z.string(),
});

export const lessonAttemptViewSchema = z.object({
  attemptId: z.string().uuid(),
  currentStep: publicLessonStepSchema.nullable(),
  feedback: z.string().nullable(),
  lessonId: z.string().uuid(),
  progress: z.object({
    completedSteps: z.number().int().nonnegative(),
    totalSteps: z.number().int().positive(),
  }),
  score: z.number().min(0).max(100).nullable(),
  status: z.enum(['started', 'completed', 'abandoned']),
  updatedAt: z.string().datetime(),
});

export type LessonOverview = z.infer<typeof lessonOverviewSchema>;
export type LessonActionInput = z.infer<typeof lessonActionInputSchema>;
export type LessonAttemptView = z.infer<typeof lessonAttemptViewSchema>;
export type PublicLessonStep = z.infer<typeof publicLessonStepSchema>;
export type StartLessonAttemptInput = z.infer<typeof startLessonAttemptInputSchema>;
