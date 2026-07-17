import type {
  BlockedUser,
  CreateReportInput,
  PrivacySettings,
  ReportReceipt,
  UpdatePrivacyInput,
} from '@xadrez/contracts';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class SafetyRepository {
  constructor(private readonly database: DatabaseService) {}

  async privacy(userId: string): Promise<PrivacySettings> {
    const [row] = await this.database.client<PrivacySettings[]>`
      SELECT
        is_profile_public AS "isProfilePublic",
        allow_challenges AS "allowChallenges",
        allow_friend_requests AS "allowFriendRequests"
      FROM user_profiles WHERE user_id = ${userId}
    `;
    if (!row) throw new NotFoundException('Usuário não encontrado');
    return row;
  }

  async updatePrivacy(userId: string, input: UpdatePrivacyInput): Promise<PrivacySettings> {
    const current = await this.privacy(userId);
    const next: PrivacySettings = {
      isProfilePublic: input.isProfilePublic ?? current.isProfilePublic,
      allowChallenges: input.allowChallenges ?? current.allowChallenges,
      allowFriendRequests: input.allowFriendRequests ?? current.allowFriendRequests,
    };
    const [row] = await this.database.client<PrivacySettings[]>`
      UPDATE user_profiles SET
        is_profile_public = ${next.isProfilePublic},
        allow_challenges = ${next.allowChallenges},
        allow_friend_requests = ${next.allowFriendRequests},
        updated_at = now()
      WHERE user_id = ${userId}
      RETURNING
        is_profile_public AS "isProfilePublic",
        allow_challenges AS "allowChallenges",
        allow_friend_requests AS "allowFriendRequests"
    `;
    if (!row) throw new NotFoundException('Usuário não encontrado');
    await this.audit(userId, 'user.privacy_updated', 'user', userId, {
      changedFields: Object.keys(input).sort(),
    });
    return row;
  }

  async listBlocks(userId: string): Promise<BlockedUser[]> {
    return this.database.client<BlockedUser[]>`
      SELECT
        blocked.id,
        blocked.username::text AS username,
        profile.display_name AS "displayName",
        relation.created_at AS "blockedAt"
      FROM user_blocks relation
      JOIN users blocked ON blocked.id = relation.blocked_user_id
      JOIN user_profiles profile ON profile.user_id = blocked.id
      WHERE relation.blocker_user_id = ${userId}
      ORDER BY relation.created_at DESC
    `.then((rows) =>
      rows.map((row) => ({ ...row, blockedAt: new Date(row.blockedAt).toISOString() })),
    );
  }

  async block(userId: string, blockedUserId: string) {
    await this.database.client.begin(async (transaction) => {
      const [target] = await transaction<{ id: string }[]>`
        SELECT id FROM users WHERE id = ${blockedUserId} AND status <> 'deleted'
      `;
      if (!target) throw new NotFoundException('Usuário não encontrado');
      await transaction`
        INSERT INTO user_blocks (blocker_user_id, blocked_user_id)
        VALUES (${userId}, ${blockedUserId})
        ON CONFLICT DO NOTHING
      `;
      await transaction`
        DELETE FROM direct_challenges
        WHERE status = 'pending'
          AND ((challenger_id = ${userId} AND challenged_id = ${blockedUserId})
            OR (challenger_id = ${blockedUserId} AND challenged_id = ${userId}))
      `;
      await transaction`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id)
        VALUES (${userId}, 'user.blocked', 'user', ${blockedUserId})
      `;
    });
  }

  async unblock(userId: string, blockedUserId: string) {
    await this.database.client.begin(async (transaction) => {
      await transaction`
        DELETE FROM user_blocks
        WHERE blocker_user_id = ${userId} AND blocked_user_id = ${blockedUserId}
      `;
      await transaction`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id)
        VALUES (${userId}, 'user.unblocked', 'user', ${blockedUserId})
      `;
    });
  }

  async createReport(
    reporterUserId: string,
    input: CreateReportInput,
    description: string | null,
  ): Promise<ReportReceipt> {
    try {
      return await this.database.client.begin(async (transaction) => {
        if (input.reportedUserId) {
          const [reported] = await transaction<{ id: string }[]>`
            SELECT id FROM users WHERE id = ${input.reportedUserId} AND status <> 'deleted'
          `;
          if (!reported) throw new NotFoundException('Usuário denunciado não encontrado');
        }
        if (input.gameId) {
          const [game] = await transaction<{ id: string }[]>`
            SELECT game.id
            FROM games game
            JOIN game_players player ON player.game_id = game.id
            WHERE game.id = ${input.gameId} AND player.user_id = ${reporterUserId}
          `;
          if (!game) throw new NotFoundException('Partida não encontrada para este usuário');
        }
        const [report] = await transaction<ReportReceipt[]>`
          INSERT INTO moderation_reports (
            reporter_user_id, reported_user_id, game_id, category, description
          ) VALUES (
            ${reporterUserId}, ${input.reportedUserId ?? null}, ${input.gameId ?? null},
            ${input.category}, ${description}
          )
          RETURNING id, category, status, created_at AS "createdAt"
        `;
        if (!report) throw new Error('Failed to create moderation report');
        await transaction`
          INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
          VALUES (
            ${reporterUserId}, 'moderation.report_created', 'moderation_report', ${report.id},
            ${transaction.json({ category: input.category })}
          )
        `;
        return { ...report, createdAt: new Date(report.createdAt).toISOString(), status: 'open' };
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new ConflictException('Denúncia já está em análise');
      throw error;
    }
  }

  async audit(
    actorUserId: string | null,
    action: string,
    entityType: string,
    entityId: string | null,
    metadata: Record<string, unknown> = {},
  ) {
    await this.database.client`
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
      VALUES (${actorUserId}, ${action}, ${entityType}, ${entityId}, ${JSON.stringify(metadata)}::jsonb)
    `;
  }

  private isUniqueViolation(error: unknown): error is { code: string } {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
  }
}
