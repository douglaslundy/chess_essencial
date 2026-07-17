import { z } from 'zod';

export const privacySettingsSchema = z.object({
  isProfilePublic: z.boolean(),
  allowChallenges: z.boolean(),
  allowFriendRequests: z.boolean(),
});

export const updatePrivacyInputSchema = privacySettingsSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos uma configuração');

export const reportCategorySchema = z.enum([
  'cheating',
  'harassment',
  'spam',
  'inappropriate_profile',
  'other',
]);

export const createReportInputSchema = z
  .object({
    reportedUserId: z.string().uuid().optional(),
    gameId: z.string().uuid().optional(),
    category: reportCategorySchema,
    description: z.string().trim().min(3).max(1000).optional(),
  })
  .refine((value) => value.reportedUserId || value.gameId, {
    message: 'Informe usuário ou partida denunciada',
  });

export const reportReceiptSchema = z.object({
  id: z.string().uuid(),
  category: reportCategorySchema,
  status: z.literal('open'),
  createdAt: z.string().datetime(),
});

export const blockedUserSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string(),
  blockedAt: z.string().datetime(),
});

export type PrivacySettings = z.infer<typeof privacySettingsSchema>;
export type UpdatePrivacyInput = z.infer<typeof updatePrivacyInputSchema>;
export type CreateReportInput = z.infer<typeof createReportInputSchema>;
export type ReportReceipt = z.infer<typeof reportReceiptSchema>;
export type BlockedUser = z.infer<typeof blockedUserSchema>;
