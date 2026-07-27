import type {
  AdminBotStats,
  AdminMetrics,
  AdminOnlineBot,
  AdminUser,
  AdminUserSearchQuery,
  UpdateAdminUserInput,
  UpdateAdminUserStatusInput,
} from '@xadrez/contracts';
import { Injectable, Optional } from '@nestjs/common';

import { AuditService } from '../observability/audit.service.js';
import { RedisService } from '../redis/redis.service.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { AdminRepository } from './admin.repository.js';

// Audit metadata only accepts primitives (see AuditService.record), so a
// null/undefined field value is rendered as this placeholder instead of
// being dropped or coerced into "null"/"undefined" strings.
const AUDIT_EMPTY_VALUE = '(vazio)';

function auditValue(value: null | number | string | undefined): number | string {
  return value === null || value === undefined ? AUDIT_EMPTY_VALUE : value;
}

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
   * anything. Every changed field is audited with its before/after value
   * (see buildUserUpdateAuditMetadata) — including the plan — but never the
   * password, which isn't editable through this endpoint at all.
   */
  async updateUser(actingUserId: string, targetUserId: string, input: UpdateAdminUserInput) {
    const { planId, ...profileInput } = input;
    const before = await this.admin.getUserDetail(targetUserId);
    let updated = await this.admin.updateUser(actingUserId, targetUserId, profileInput);
    if (planId !== undefined) {
      await this.subscriptions.adminSetPlan(targetUserId, planId);
      updated = await this.admin.getUserDetail(targetUserId);
    }
    await this.audit?.record(
      actingUserId,
      'admin.user_updated',
      'user',
      targetUserId,
      this.buildUserUpdateAuditMetadata(input, before, updated),
    );
    return updated;
  }

  /**
   * Only the fields actually present in `input` get an entry — untouched
   * fields aren't padded in with their unchanged value. Arrays (roles) are
   * flattened to a comma-joined string since AuditService.record only
   * accepts string/number/boolean metadata values.
   */
  private buildUserUpdateAuditMetadata(
    input: UpdateAdminUserInput,
    before: AdminUser,
    after: AdminUser,
  ): Record<string, boolean | number | string> {
    const metadata: Record<string, boolean | number | string> = {};
    if (input.displayName !== undefined) {
      metadata.display_name_before = auditValue(before.displayName);
      metadata.display_name_after = auditValue(after.displayName);
    }
    if (input.email !== undefined) {
      metadata.email_before = before.email;
      metadata.email_after = after.email;
    }
    if (input.status !== undefined) {
      metadata.status_before = before.status;
      metadata.status_after = after.status;
    }
    if (input.roles !== undefined) {
      metadata.roles_before = before.roles.join(', ') || AUDIT_EMPTY_VALUE;
      metadata.roles_after = after.roles.join(', ') || AUDIT_EMPTY_VALUE;
    }
    if (input.planId !== undefined) {
      metadata.plan_id_before = auditValue(before.planId);
      metadata.plan_id_after = auditValue(after.planId);
    }
    return metadata;
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
