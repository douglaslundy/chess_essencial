import type {
  AdminBotStats,
  AdminMetrics,
  AdminOnlineBot,
  AdminUserSearchQuery,
  UpdateAdminUserInput,
  UpdateAdminUserStatusInput,
} from '@xadrez/contracts';
import { Injectable, Optional } from '@nestjs/common';

import { AuditService } from '../observability/audit.service.js';
import { RedisService } from '../redis/redis.service.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { AdminRepository } from './admin.repository.js';

@Injectable()
export class AdminService {
  constructor(
    private readonly admin: AdminRepository,
    private readonly redis: RedisService,
    private readonly subscriptions: SubscriptionsService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  listUsers(query: AdminUserSearchQuery) {
    return this.admin.listUsers(query);
  }

  async updateUserStatus(
    actingUserId: string,
    targetUserId: string,
    input: UpdateAdminUserStatusInput,
  ) {
    const updated = await this.admin.updateStatus(actingUserId, targetUserId, input);
    await this.audit?.record(actingUserId, 'admin.user_status_updated', 'user', targetUserId, {
      status: input.status,
    });
    return updated;
  }

  /**
   * Applies the profile fields via AdminRepository, then the plan (if
   * present) via SubscriptionsService — two separate writes, but the plan
   * change is idempotent-safe on its own (see adminSetPlan), so a failure
   * between the two just leaves the plan unchanged rather than corrupting
   * anything. Every changed field is audited, but never the plan/roles'
   * underlying IDs beyond what's needed to know what changed — no secrets
   * are involved here either way.
   */
  async updateUser(actingUserId: string, targetUserId: string, input: UpdateAdminUserInput) {
    const { planId, ...profileInput } = input;
    let updated = await this.admin.updateUser(actingUserId, targetUserId, profileInput);
    if (planId !== undefined) {
      await this.subscriptions.adminSetPlan(targetUserId, planId);
      updated = await this.admin.getUserDetail(targetUserId);
    }
    await this.audit?.record(actingUserId, 'admin.user_updated', 'user', targetUserId, {
      fields: Object.keys(input).join(','),
    });
    return updated;
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

  async listOnlineBots(): Promise<AdminOnlineBot[]> {
    const personas = await this.admin.listBotPersonas();
    if (personas.length === 0) return [];
    const pipeline = this.redis.client.pipeline();
    for (const persona of personas) pipeline.exists(`presence:${persona.userId}`);
    const results = (await pipeline.exec()) ?? [];
    return personas.filter((_, index) => results[index]?.[1] === 1);
  }

  getMetrics(): Promise<AdminMetrics> {
    return this.admin.metrics();
  }
}
