import type {
  AdminBotStats,
  AdminUserSearchQuery,
  UpdateAdminUserStatusInput,
} from '@xadrez/contracts';
import { Injectable } from '@nestjs/common';

import { RedisService } from '../redis/redis.service.js';
import { AdminRepository } from './admin.repository.js';

@Injectable()
export class AdminService {
  constructor(
    private readonly admin: AdminRepository,
    private readonly redis: RedisService,
  ) {}

  listUsers(query: AdminUserSearchQuery) {
    return this.admin.listUsers(query);
  }

  updateUserStatus(actingUserId: string, targetUserId: string, input: UpdateAdminUserStatusInput) {
    return this.admin.updateStatus(actingUserId, targetUserId, input);
  }

  async getBotStats(): Promise<AdminBotStats> {
    const stats = await this.admin.botPersonaStats();
    let onlineNow = 0;
    if (stats.personaUserIds.length > 0) {
      const pipeline = this.redis.client.pipeline();
      for (const userId of stats.personaUserIds) pipeline.exists(`presence:${userId}`);
      const results = (await pipeline.exec()) ?? [];
      onlineNow = results.filter((result) => result[1] === 1).length;
    }
    return {
      friendshipsCount: stats.friendshipsCount,
      gamesPlayed: stats.gamesPlayed,
      onlineNow,
      total: stats.total,
    };
  }
}
