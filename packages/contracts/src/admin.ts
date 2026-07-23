import { z } from 'zod';

export const adminUserStatusSchema = z.enum(['pending', 'active', 'suspended', 'deleted']);

export const adminUserSchema = z.object({
  createdAt: z.string().datetime(),
  displayName: z.string().nullable(),
  email: z.string(),
  id: z.string().uuid(),
  isAdmin: z.boolean(),
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

export const adminBotStatsSchema = z.object({
  friendshipsCount: z.number().int().nonnegative(),
  gamesPlayed: z.number().int().nonnegative(),
  onlineNow: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export type AdminBotStats = z.infer<typeof adminBotStatsSchema>;
export type AdminUser = z.infer<typeof adminUserSchema>;
export type AdminUserList = z.infer<typeof adminUserListSchema>;
export type AdminUserSearchQuery = z.infer<typeof adminUserSearchQuerySchema>;
export type AdminUserStatus = z.infer<typeof adminUserStatusSchema>;
export type UpdateAdminUserStatusInput = z.infer<typeof updateAdminUserStatusInputSchema>;
