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

export const moderationReportStatusSchema = z.enum(['open', 'reviewing', 'resolved', 'dismissed']);

export const moderationQueueQuerySchema = z.object({
  status: moderationReportStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const moderateReportInputSchema = z
  .object({
    status: z.enum(['reviewing', 'resolved', 'dismissed']),
    note: z.string().trim().min(3).max(1000).optional(),
  })
  .refine((value) => value.status === 'reviewing' || value.note !== undefined, {
    message: 'Informe a decisão para encerrar a denúncia',
    path: ['note'],
  });

export type ModerationReportStatus = z.infer<typeof moderationReportStatusSchema>;
export type ModerationQueueQuery = z.infer<typeof moderationQueueQuerySchema>;
export type ModerateReportInput = z.infer<typeof moderateReportInputSchema>;

export interface ModerationUserRef {
  id: string;
  username: string | null;
  displayName?: string | null;
}

export interface ModerationReportSummary {
  id: string;
  category: string;
  description: string | null;
  status: ModerationReportStatus;
  gameId: string | null;
  reporter: ModerationUserRef;
  reportedUser: ModerationUserRef | null;
  resolution: string | null;
  resolvedBy: ModerationUserRef | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  slaDueAt: string;
  overdue: boolean;
}

export interface ModerationReportEvent {
  id: number;
  actor: ModerationUserRef | null;
  fromStatus: ModerationReportStatus | null;
  toStatus: ModerationReportStatus;
  note: string | null;
  createdAt: string;
}

export interface ModerationReportDetail extends ModerationReportSummary {
  history: ModerationReportEvent[];
}

export interface ModerationReportList {
  items: ModerationReportSummary[];
  total: number;
}

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
