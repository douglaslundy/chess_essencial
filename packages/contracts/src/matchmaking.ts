import { z } from 'zod';

export const ratingPoolSchema = z.enum(['bullet', 'blitz', 'rapid', 'classical', 'correspondence']);

export const joinQueueInputSchema = z.object({
  timeControlCode: z.string().trim().min(1).max(40),
});

export const createChallengeInputSchema = z.object({
  challengedUserId: z.string().uuid(),
  timeControlCode: z.string().trim().min(1).max(40),
  challengerColor: z.enum(['white', 'black']).nullable().default(null),
});

export const respondChallengeInputSchema = z.object({
  accept: z.boolean(),
});

export const queueStatusSchema = z.object({
  status: z.enum(['queued', 'matched']),
  pool: ratingPoolSchema,
  timeControlCode: z.string(),
  minRating: z.number().int(),
  maxRating: z.number().int(),
  enqueuedAt: z.string().datetime(),
  gameId: z.string().uuid().optional(),
});

export type CreateChallengeInput = z.infer<typeof createChallengeInputSchema>;
export type JoinQueueInput = z.infer<typeof joinQueueInputSchema>;
export type QueueStatus = z.infer<typeof queueStatusSchema>;
export type RatingPool = z.infer<typeof ratingPoolSchema>;
export type RespondChallengeInput = z.infer<typeof respondChallengeInputSchema>;
