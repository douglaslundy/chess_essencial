import { z } from 'zod';

export const exercisePositionTypeSchema = z.enum([
  'legal_position',
  'illustrative_diagram',
  'text_only',
]);
export const exerciseAnswerFormatSchema = z.enum(['free_text', 'move_sequence']);

export const exerciseSearchQuerySchema = z.object({
  category: z.string().min(1).max(60).optional(),
  chapter: z.coerce.number().int().positive().optional(),
  difficulty: z.string().min(1).max(20).optional(),
  lessonId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  module: z.coerce.number().int().min(1).max(10).optional(),
  offset: z.coerce.number().int().nonnegative().default(0),
  positionType: exercisePositionTypeSchema.optional(),
  q: z.string().trim().min(1).max(120).optional(),
  source: z.enum(['classic', 'book']).optional(),
});

export const exerciseSummarySchema = z.object({
  answerFormat: exerciseAnswerFormatSchema,
  category: z.string().nullable(),
  chapterNumber: z.number().int().positive().nullable(),
  difficulty: z.string().nullable(),
  fen: z.string().nullable(),
  id: z.string().uuid(),
  moduleNumber: z.number().int().min(1).max(10).nullable(),
  positionType: exercisePositionTypeSchema,
  promptMd: z.string(),
  sideToMove: z.enum(['white', 'black']).nullable(),
  sourceNumber: z.number().int().positive().nullable(),
  sourcePages: z.array(z.number().int().positive()),
  tags: z.array(z.string()),
  title: z.string().nullable(),
});

export const exerciseSearchResultSchema = z.object({
  items: z.array(exerciseSummarySchema),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export const exerciseTrainingFiltersSchema = exerciseSearchQuerySchema
  .omit({ limit: true, offset: true })
  .extend({ limit: z.number().int().min(1).max(50).default(10) });

export const startExerciseTrainingInputSchema = z.object({
  filters: exerciseTrainingFiltersSchema.default({ limit: 10 }),
});

export const exerciseTrainingViewSchema = z.object({
  completed: z.number().int().nonnegative(),
  currentExercise: exerciseSummarySchema.nullable(),
  position: z.number().int().nonnegative(),
  sessionId: z.string().uuid(),
  status: z.enum(['started', 'completed', 'abandoned']),
  total: z.number().int().nonnegative(),
});

export const submitExerciseAttemptInputSchema = z.object({
  durationMs: z.number().int().min(0).max(86_400_000),
  lessonAttemptId: z.string().uuid().optional(),
  submittedLine: z.array(z.string().trim().min(2).max(20)).min(1).max(50),
  trainingSessionId: z.string().uuid().optional(),
});

export const exerciseAttemptResultSchema = z.object({
  attemptId: z.string().uuid(),
  correct: z.boolean(),
  hintsUsed: z.number().int().nonnegative(),
  score: z.number().min(0).max(100),
  training: exerciseTrainingViewSchema.nullable(),
});

export const exerciseStudyStepSchema = z.object({
  bodyMd: z.string(),
  title: z.string().nullable(),
});

export const exerciseStudyContextSchema = z.object({
  chapterNumber: z.number().int().positive().nullable(),
  lessonTitle: z.string().nullable(),
  moduleTitle: z.string().nullable(),
  sourcePages: z.array(z.number().int().positive()),
  teaching: z.array(exerciseStudyStepSchema),
});

export const evaluateExerciseLineInputSchema = z.object({
  playedMoves: z.array(z.string().trim().min(2).max(20)).min(1).max(50),
  trainingSessionId: z.string().uuid(),
});

export const evaluateExerciseLineResultSchema = z.object({
  attempt: exerciseAttemptResultSchema.nullable(),
  movesConfirmed: z.number().int().nonnegative(),
  opponentReply: z.string().nullable(),
  status: z.enum(['continue', 'solved', 'incorrect']),
});

export const exerciseHintSchema = z.object({
  hint: z.string(),
  hintNumber: z.number().int().positive(),
  remaining: z.number().int().nonnegative(),
});

export const exerciseSolutionSchema = z.object({
  solutionLines: z.array(z.array(z.string())),
  solutionMd: z.string(),
});

export const exerciseMetricsSchema = z.object({
  accuracyPercent: z.number().min(0).max(100),
  attempted: z.number().int().nonnegative(),
  averageDurationMs: z.number().int().nonnegative(),
  correct: z.number().int().nonnegative(),
  hintsUsed: z.number().int().nonnegative(),
});

export const exerciseImportReportSchema = z.object({
  importRunId: z.string().uuid().nullable(),
  imported: z.number().int().nonnegative(),
  reasons: z.record(z.string(), z.number().int().positive()),
  rejected: z.number().int().nonnegative(),
  sourceName: z.string(),
  total: z.number().int().nonnegative(),
});

export type EvaluateExerciseLineInput = z.infer<typeof evaluateExerciseLineInputSchema>;
export type EvaluateExerciseLineResult = z.infer<typeof evaluateExerciseLineResultSchema>;
export type ExerciseAttemptResult = z.infer<typeof exerciseAttemptResultSchema>;
export type ExerciseHint = z.infer<typeof exerciseHintSchema>;
export type ExerciseImportReport = z.infer<typeof exerciseImportReportSchema>;
export type ExerciseMetrics = z.infer<typeof exerciseMetricsSchema>;
export type ExerciseSearchQuery = z.infer<typeof exerciseSearchQuerySchema>;
export type ExerciseSearchResult = z.infer<typeof exerciseSearchResultSchema>;
export type ExerciseSolution = z.infer<typeof exerciseSolutionSchema>;
export type ExerciseStudyContext = z.infer<typeof exerciseStudyContextSchema>;
export type ExerciseSummary = z.infer<typeof exerciseSummarySchema>;
export type ExerciseTrainingFilters = z.infer<typeof exerciseTrainingFiltersSchema>;
export type ExerciseTrainingView = z.infer<typeof exerciseTrainingViewSchema>;
export type StartExerciseTrainingInput = z.infer<typeof startExerciseTrainingInputSchema>;
export type SubmitExerciseAttemptInput = z.infer<typeof submitExerciseAttemptInputSchema>;
