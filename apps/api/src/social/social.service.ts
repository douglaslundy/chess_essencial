import type { Friend, FriendRequestsView, PublicProfile } from '@xadrez/contracts';
import { Injectable } from '@nestjs/common';

import { toIsoStringOrNull } from '../common/dates/to-iso-string.js';
import { RedisService } from '../redis/redis.service.js';
import { SocialRepository } from './social.repository.js';

const PRESENCE_TTL_SECONDS = 90;
const presenceKey = (userId: string) => `presence:${userId}`;

@Injectable()
export class SocialService {
  constructor(
    private readonly social: SocialRepository,
    private readonly redis: RedisService,
  ) {}

  async heartbeat(userId: string): Promise<void> {
    await Promise.all([
      this.redis.client.set(presenceKey(userId), '1', 'EX', PRESENCE_TTL_SECONDS),
      this.social.touchLastSeen(userId),
    ]);
  }

  private async isOnline(userId: string): Promise<boolean> {
    return (await this.redis.client.exists(presenceKey(userId))) === 1;
  }

  private async withPresence<T extends { userId: string }>(
    rows: T[],
  ): Promise<(T & { online: boolean })[]> {
    if (rows.length === 0) return [];
    const keys = rows.map((row) => presenceKey(row.userId));
    const pipeline = this.redis.client.pipeline();
    for (const key of keys) pipeline.exists(key);
    const results = (await pipeline.exec()) ?? [];
    return rows.map((row, index) => ({ ...row, online: results[index]?.[1] === 1 }));
  }

  async listFriends(userId: string): Promise<Friend[]> {
    const friends = await this.social.listFriends(userId);
    const withOnline = await this.withPresence(friends);
    return withOnline.map((friend) => ({
      displayName: friend.displayName,
      presence: { lastSeenAt: friend.presence.lastSeenAt, online: friend.online },
      userId: friend.userId,
      username: friend.username,
    }));
  }

  sendRequest(requesterId: string, username: string) {
    return this.social.sendRequest(requesterId, username);
  }

  async acceptRequest(addresseeId: string, requesterUsername: string): Promise<Friend> {
    const friend = await this.social.respondToRequest(addresseeId, requesterUsername, true);
    if (!friend) throw new Error('unexpected null on accept');
    const online = await this.isOnline(friend.userId);
    return { ...friend, presence: { ...friend.presence, online } };
  }

  async declineRequest(addresseeId: string, requesterUsername: string): Promise<void> {
    await this.social.respondToRequest(addresseeId, requesterUsername, false);
  }

  cancelRequest(requesterId: string, addresseeUsername: string) {
    return this.social.cancelRequest(requesterId, addresseeUsername);
  }

  removeFriend(userId: string, friendId: string) {
    return this.social.removeFriend(userId, friendId);
  }

  listRequests(userId: string): Promise<FriendRequestsView> {
    return this.social.listRequests(userId);
  }

  async publicProfile(viewerId: string | null, username: string): Promise<PublicProfile> {
    const profile = await this.social.publicProfile(viewerId, username);
    const online = await this.isOnline(profile.userId);
    return {
      displayName: profile.displayName,
      friendshipStatus: profile.friendshipStatus,
      presence: { lastSeenAt: toIsoStringOrNull(profile.lastSeenAt), online },
      ratings: profile.ratings.map((rating) => ({
        pool: rating.pool as PublicProfile['ratings'][number]['pool'],
        rating: rating.rating,
      })),
      userId: profile.userId,
      username: profile.username,
    };
  }
}
