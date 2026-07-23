import { z } from 'zod';

export const presenceSchema = z.object({
  lastSeenAt: z.string().datetime().nullable(),
  online: z.boolean(),
});

export const friendSchema = z.object({
  displayName: z.string(),
  presence: presenceSchema,
  userId: z.string().uuid(),
  username: z.string(),
});

export const friendRequestSchema = z.object({
  createdAt: z.string().datetime(),
  displayName: z.string(),
  userId: z.string().uuid(),
  username: z.string(),
});

export const friendRequestsViewSchema = z.object({
  incoming: z.array(friendRequestSchema),
  outgoing: z.array(friendRequestSchema),
});

export const sendFriendRequestInputSchema = z.object({
  username: z.string().trim().min(3).max(30),
});

export const publicProfileSchema = z.object({
  displayName: z.string(),
  friendshipStatus: z.enum(['none', 'pending_outgoing', 'pending_incoming', 'friends', 'self']),
  presence: presenceSchema,
  ratings: z.array(
    z.object({
      pool: z.enum(['bullet', 'blitz', 'rapid', 'classical', 'correspondence']),
      rating: z.number().int(),
    }),
  ),
  userId: z.string().uuid(),
  username: z.string(),
});

export type Friend = z.infer<typeof friendSchema>;
export type FriendRequest = z.infer<typeof friendRequestSchema>;
export type FriendRequestsView = z.infer<typeof friendRequestsViewSchema>;
export type Presence = z.infer<typeof presenceSchema>;
export type PublicProfile = z.infer<typeof publicProfileSchema>;
export type SendFriendRequestInput = z.infer<typeof sendFriendRequestInputSchema>;
