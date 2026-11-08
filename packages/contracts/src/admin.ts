import { z } from 'zod';

export const adminUserStatusSchema = z.enum(['pending', 'active', 'suspended', 'deleted']);

// The whole role/hierarchy model in this codebase — a flat membership table
// (user_roles), not tiered levels. "Cannot edit another admin" (enforced in
// admin.repository.ts) is the entire hierarchy rule; there is no separate
// superadmin tier to model here.
export const adminUserRoleSchema = z.enum(['admin', 'content_editor', 'teacher']);

export const adminUserSchema = z.object({
  avatarUrl: z.string().nullable(),
  createdAt: z.string().datetime(),
  displayName: z.string().nullable(),
  email: z.string(),
  id: z.string().uuid(),
  isAdmin: z.boolean(),
  planId: z.string().uuid().nullable(),
  planName: z.string().nullable(),
  roles: z.array(adminUserRoleSchema),
  status: adminUserStatusSchema,
  username: z.string(),
});

export const adminUserListSchema = z.object({
  items: z.array(adminUserSchema),
  total: z.number().int().nonnegative(),
});

export const adminUserSearchQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
  q: z.string().trim().min(1).max(120).optional(),
  status: adminUserStatusSchema.optional(),
});

// Admins may move a user between active/suspended/deleted. 'deleted' is a
// reversible soft-delete (status only); it never hard-deletes data.
export const updateAdminUserStatusInputSchema = z.object({
  status: z.enum(['active', 'suspended', 'deleted']),
});

// Every field optional and independently applied — the admin can change just
// one thing (e.g. only the plan) without resending the rest. Password is
// deliberately never a field here: use the existing forgot/reset-password
// flow instead (auth.controller.ts).
export const updateAdminUserInputSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  planId: z.string().uuid().nullable().optional(),
  roles: z.array(adminUserRoleSchema).optional(),
  status: z.enum(['active', 'suspended', 'deleted']).optional(),
});

export const adminBotStatsSchema = z.object({
  friendshipsCount: z.number().int().nonnegative(),
  gamesPlayed: z.number().int().nonnegative(),
  onlineNow: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export const adminOnlineBotSchema = z.object({
  avatarUrl: z.string().nullable(),
  displayName: z.string(),
  targetRating: z.number().int(),
  userId: z.string().uuid(),
  username: z.string(),
});

export const adminMetricsSchema = z.object({
  activeSubscriptionsByPlan: z.array(
    z.object({ count: z.number().int().nonnegative(), planName: z.string() }),
  ),
  exercisesSolvedTotal: z.number().int().nonnegative(),
  gamesPlayedToday: z.number().int().nonnegative(),
  gamesPlayedTotal: z.number().int().nonnegative(),
  lessonsCompletedTotal: z.number().int().nonnegative(),
  newUsersLast7Days: z.number().int().nonnegative(),
  referralsRewarded: z.number().int().nonnegative(),
  referralsTotal: z.number().int().nonnegative(),
  totalUsers: z.number().int().nonnegative(),
});

export type AdminBotStats = z.infer<typeof adminBotStatsSchema>;
export type AdminOnlineBot = z.infer<typeof adminOnlineBotSchema>;
export type AdminMetrics = z.infer<typeof adminMetricsSchema>;
export type AdminUser = z.infer<typeof adminUserSchema>;
export type AdminUserList = z.infer<typeof adminUserListSchema>;
export type AdminUserRole = z.infer<typeof adminUserRoleSchema>;
export type AdminUserSearchQuery = z.infer<typeof adminUserSearchQuerySchema>;
export type AdminUserStatus = z.infer<typeof adminUserStatusSchema>;
export type UpdateAdminUserInput = z.infer<typeof updateAdminUserInputSchema>;
export type UpdateAdminUserStatusInput = z.infer<typeof updateAdminUserStatusInputSchema>;
