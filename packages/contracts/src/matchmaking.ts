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
  'untimed',
]);

export const botDifficultySchema = z.enum([
  'matched',
  'beginner',
  'intermediate',
  'advanced',
  'expert',
]);
export const playerColorPreferenceSchema = z.enum(['white', 'black', 'random']);

export const createBotGameInputSchema = z.object({
  botDifficulty: botDifficultySchema.default('matched'),
  playerColor: playerColorPreferenceSchema.default('random'),
  timeControlCode: timeControlCodeSchema,
  // Treinador mode: bot strength always matches the player's own rating
  // (server ignores botDifficulty and forces 'matched') and the game never
  // counts toward the official rating, regardless of the time control.
  coachMode: z.boolean().default(false),
});

export const joinQueueInputSchema = z.object({
  botDifficulty: botDifficultySchema.default('matched'),
  fallbackToBot: z.boolean().default(false),
  playerColor: playerColorPreferenceSchema.default('random'),
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

export const directChallengeSchema = z.object({
  id: z.string().uuid(),
  counterpart: z.object({
    displayName: z.string(),
    userId: z.string().uuid(),
    username: z.string(),
  }),
  challengerColor: z.enum(['white', 'black']).nullable(),
  timeControlCode: timeControlCodeSchema,
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  gameId: z.string().uuid().nullable(),
});

export const directChallengesViewSchema = z.object({
  incoming: z.array(directChallengeSchema),
  outgoing: z.array(directChallengeSchema),
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

export type BotDifficulty = z.infer<typeof botDifficultySchema>;
export type CreateBotGameInput = z.infer<typeof createBotGameInputSchema>;
export type TimeControlCode = z.infer<typeof timeControlCodeSchema>;
export type PlayerColorPreference = z.infer<typeof playerColorPreferenceSchema>;
export type CreateChallengeInput = z.infer<typeof createChallengeInputSchema>;
export type JoinQueueInput = z.infer<typeof joinQueueInputSchema>;
export type QueueStatus = z.infer<typeof queueStatusSchema>;
export type RatingPool = z.infer<typeof ratingPoolSchema>;
export type RespondChallengeInput = z.infer<typeof respondChallengeInputSchema>;
export type DirectChallenge = z.infer<typeof directChallengeSchema>;
export type DirectChallengesView = z.infer<typeof directChallengesViewSchema>;
