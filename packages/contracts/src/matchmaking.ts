import { z } from 'zod';

export const ratingPoolSchema = z.enum(['bullet', 'blitz', 'rapid', 'classical', 'correspondence']);

export const timeControlCodeSchema = z.enum([
  'bullet-1-0',
  'bullet-2-1',
  'blitz-3-0',
  'blitz-3-2',
  'rapid-10-0',
  'rapid-15-10',
  'classical-30-0',
]);

export const joinQueueInputSchema = z.object({
  timeControlCode: timeControlCodeSchema,
});

export const createChallengeInputSchema = z.object({
  challengedUserId: z.string().uuid(),
  timeControlCode: timeControlCodeSchema,
  challengerColor: z.enum(['white', 'black']).nullable().default(null),
});

export const respondChallengeInputSchema = z.object({
  accept: z.boolean(),
});

export const queueStatusSchema = z.object({
  status: z.enum(['queued', 'matched']),
  pool: ratingPoolSchema,
  timeControlCode: timeControlCodeSchema,
  minRating: z.number().int(),
  maxRating: z.number().int(),
  enqueuedAt: z.string().datetime(),
  gameId: z.string().uuid().optional(),
});

export type TimeControlCode = z.infer<typeof timeControlCodeSchema>;
export type CreateChallengeInput = z.infer<typeof createChallengeInputSchema>;
export type JoinQueueInput = z.infer<typeof joinQueueInputSchema>;
export type QueueStatus = z.infer<typeof queueStatusSchema>;
export type RatingPool = z.infer<typeof ratingPoolSchema>;
export type RespondChallengeInput = z.infer<typeof respondChallengeInputSchema>;
