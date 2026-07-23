import type { Conversation, DirectMessage } from '@xadrez/contracts';
import { Injectable } from '@nestjs/common';

import { RedisService } from '../redis/redis.service.js';
import { MessagesRepository } from './messages.repository.js';

const presenceKey = (userId: string) => `presence:${userId}`;

@Injectable()
export class MessagesService {
  constructor(
    private readonly messages: MessagesRepository,
    private readonly redis: RedisService,
  ) {}

  async listConversations(userId: string): Promise<Conversation[]> {
    const conversations = await this.messages.listConversations(userId);
    if (conversations.length === 0) return [];
    const pipeline = this.redis.client.pipeline();
    for (const conversation of conversations) pipeline.exists(presenceKey(conversation.userId));
    const results = (await pipeline.exec()) ?? [];
    return conversations.map(({ lastSeenAt, ...conversation }, index) => ({
      ...conversation,
      presence: { lastSeenAt, online: results[index]?.[1] === 1 },
    }));
  }

  listMessages(userId: string, friendId: string, before?: string): Promise<DirectMessage[]> {
    return this.messages.listMessages(userId, friendId, before ?? null);
  }

  sendMessage(senderId: string, recipientId: string, body: string): Promise<DirectMessage> {
    return this.messages.sendMessage(senderId, recipientId, body);
  }
}
