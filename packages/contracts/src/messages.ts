import { z } from 'zod';

import { presenceSchema } from './social.js';

export const directMessageSchema = z.object({
  body: z.string(),
  createdAt: z.string().datetime(),
  id: z.string().uuid(),
  mine: z.boolean(),
  recipientId: z.string().uuid(),
  senderId: z.string().uuid(),
});

export const conversationSchema = z.object({
  displayName: z.string(),
  lastMessage: z
    .object({
      body: z.string(),
      createdAt: z.string().datetime(),
      mine: z.boolean(),
    })
    .nullable(),
  presence: presenceSchema,
  unreadCount: z.number().int(),
  userId: z.string().uuid(),
  username: z.string(),
});

export const sendMessageInputSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

export type Conversation = z.infer<typeof conversationSchema>;
export type DirectMessage = z.infer<typeof directMessageSchema>;
export type SendMessageInput = z.infer<typeof sendMessageInputSchema>;
