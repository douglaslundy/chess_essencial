import { z } from 'zod';

export const learningStageTypeSchema = z.enum([
  'challenge',
  'lesson',
  'review',
  'checkpoint',
  'boss',
]);

export const learningStageStatusSchema = z.enum(['locked', 'available', 'completed']);
export const learningLevelStatusSchema = z.enum(['locked', 'current', 'completed']);

export const learningStageSummarySchema = z.object({
  id: z.string().uuid(),
  position: z.number().int(),
  status: learningStageStatusSchema,
  type: learningStageTypeSchema,
});

export const learningLevelSummarySchema = z.object({
  completedStageCount: z.number().int(),
  id: z.string().uuid(),
  isCapstone: z.boolean(),
  position: z.number().int(),
  stageCount: z.number().int(),
  status: learningLevelStatusSchema,
  title: z.string(),
});

export const learningWorldSummarySchema = z.object({
  description: z.string(),
  id: z.string().uuid(),
  levels: z.array(learningLevelSummarySchema),
  position: z.number().int(),
  title: z.string(),
});

export const learningMapSchema = z.object({
  worlds: z.array(learningWorldSummarySchema),
});

export const learningLevelDetailSchema = learningLevelSummarySchema.extend({
  stages: z.array(learningStageSummarySchema),
  worldId: z.string().uuid(),
});

export const learningProgressSchema = z.object({
  currentLevelId: z.string().uuid().nullable(),
  currentWorldId: z.string().uuid().nullable(),
  highestUnlockedLevelId: z.string().uuid().nullable(),
  streakDays: z.number().int(),
  xp: z.number().int(),
});

export const startLearningStageResultSchema = z.object({
  exerciseId: z.string().uuid(),
  stageId: z.string().uuid(),
  trainingSessionId: z.string().uuid(),
  type: learningStageTypeSchema,
});

export const completeLearningStageResultSchema = z.object({
  correctFirstTry: z.boolean(),
  hintsUsed: z.number().int(),
  levelCompleted: z.boolean(),
  stageId: z.string().uuid(),
  status: learningStageStatusSchema,
  worldCompleted: z.boolean(),
});

export type LearningStageType = z.infer<typeof learningStageTypeSchema>;
export type LearningStageStatus = z.infer<typeof learningStageStatusSchema>;
export type LearningLevelStatus = z.infer<typeof learningLevelStatusSchema>;
export type LearningStageSummary = z.infer<typeof learningStageSummarySchema>;
export type LearningLevelSummary = z.infer<typeof learningLevelSummarySchema>;
export type LearningWorldSummary = z.infer<typeof learningWorldSummarySchema>;
export type LearningMap = z.infer<typeof learningMapSchema>;
export type LearningLevelDetail = z.infer<typeof learningLevelDetailSchema>;
export type LearningProgress = z.infer<typeof learningProgressSchema>;
export type StartLearningStageResult = z.infer<typeof startLearningStageResultSchema>;
export type CompleteLearningStageResult = z.infer<typeof completeLearningStageResultSchema>;
