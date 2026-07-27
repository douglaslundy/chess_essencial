import type {
  AdminUserRole,
  AdminUserSearchQuery,
  UpdateAdminUserInput,
  UpdateAdminUserStatusInput,
} from '@xadrez/contracts';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Sql } from 'postgres';

import { toIsoString } from '../common/dates/to-iso-string.js';
import { DatabaseService } from '../database/database.service.js';

type AdminUserRow = {
  avatar_url: string | null;
  created_at: Date | string;
  display_name: string | null;
  email: string;
  id: string;
  is_admin: boolean;
  plan_id: string | null;
  plan_name: string | null;
  roles: AdminUserRole[] | null;
  status: 'pending' | 'active' | 'suspended' | 'deleted';
  username: string;
};

function toAdminUser(row: AdminUserRow) {
  return {
    avatarUrl: row.avatar_url,
    createdAt: toIsoString(row.created_at),
    displayName: row.display_name,
    email: row.email,
    id: row.id,
    isAdmin: row.is_admin,
    planId: row.plan_id,
    planName: row.plan_name,
    roles: row.roles ?? [],
    status: row.status,
    username: row.username,
  };
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

// Shared SELECT for listUsers/updateStatus/updateUser so the three never
// drift out of sync on which columns an "admin user" actually has.
function adminUserSelect(sql: Sql) {
  return sql`
    SELECT u.id, u.email, u.username, u.status, u.created_at,
      p.display_name, p.avatar_url,
      EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role = 'admin') AS is_admin,
      COALESCE(
        (SELECT array_agg(r.role ORDER BY r.role) FROM user_roles r WHERE r.user_id = u.id),
        '{}'
      ) AS roles,
      sp.id AS plan_id,
      sp.name AS plan_name
      FROM users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      LEFT JOIN user_subscriptions us ON us.user_id = u.id AND us.status = 'active'
      LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
  `;
}

@Injectable()
export class AdminRepository {
  constructor(private readonly database: DatabaseService) {}

  async listUsers(query: AdminUserSearchQuery) {
    const sql = this.database.client;
    const q = query.q ?? null;
    const status = query.status ?? null;
    const [count] = await sql<{ total: number }[]>`
      SELECT count(*)::integer AS total FROM users u
       WHERE (${status}::text IS NULL OR u.status = ${status}::user_status)
         AND (${q}::text IS NULL OR concat_ws(' ', u.username, u.email) ILIKE '%' || ${q} || '%')
    `;
    const rows = await sql<AdminUserRow[]>`${adminUserSelect(sql)}
       WHERE (${status}::text IS NULL OR u.status = ${status}::user_status)
         AND (${q}::text IS NULL OR concat_ws(' ', u.username, u.email) ILIKE '%' || ${q} || '%')
       ORDER BY u.created_at DESC
       LIMIT ${query.limit} OFFSET ${query.offset}
    `;
    return { items: rows.map(toAdminUser), total: count?.total ?? 0 };
  }

  private async assertEditable(sql: Sql, actingUserId: string, targetUserId: string) {
    if (actingUserId === targetUserId) {
      throw new BadRequestException('Você não pode alterar a própria conta por aqui.');
    }
    const [target] = await sql<{ is_admin: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = ${targetUserId} AND r.role = 'admin') AS is_admin
        FROM users u WHERE u.id = ${targetUserId}
    `;
    if (!target) throw new NotFoundException('Usuário não encontrado');
    if (target.is_admin) {
      throw new BadRequestException('Não é possível alterar outro administrador.');
    }
  }

  async updateStatus(
    actingUserId: string,
    targetUserId: string,
    input: UpdateAdminUserStatusInput,
  ) {
    const sql = this.database.client;
    await this.assertEditable(sql, actingUserId, targetUserId);
    const [updated] = await sql<{ id: string }[]>`
      UPDATE users SET status = ${input.status}::user_status, updated_at = now()
       WHERE id = ${targetUserId}
       RETURNING id
    `;
    if (!updated) throw new NotFoundException('Usuário não encontrado');
    // Suspending or deleting a user revokes their active sessions.
    if (input.status !== 'active') {
      await sql`DELETE FROM user_sessions WHERE user_id = ${targetUserId}`;
    }
    return this.getUserDetail(targetUserId);
  }

  /**
   * Full profile edit (name/e-mail/status/roles) — plan changes go through
   * SubscriptionsService.adminSetPlan instead (apps/api/src/admin/admin.service.ts),
   * to keep subscription writes in one place. Every field is independently
   * optional; only what's present is touched. Reuses the exact same
   * "can't touch self or another admin" guard as updateStatus.
   */
  async updateUser(actingUserId: string, targetUserId: string, input: UpdateAdminUserInput) {
    const sql = this.database.client;
    await this.assertEditable(sql, actingUserId, targetUserId);

    try {
      await sql.begin(async (transaction) => {
        if (input.displayName !== undefined) {
          await transaction`
            UPDATE user_profiles SET display_name = ${input.displayName}
             WHERE user_id = ${targetUserId}
          `;
        }
        if (input.email !== undefined) {
          await transaction`
            UPDATE users SET email = ${input.email}, email_verified_at = NULL, updated_at = now()
             WHERE id = ${targetUserId}
          `;
        }
        if (input.status !== undefined) {
          await transaction`
            UPDATE users SET status = ${input.status}::user_status, updated_at = now()
             WHERE id = ${targetUserId}
          `;
          if (input.status !== 'active') {
            await transaction`DELETE FROM user_sessions WHERE user_id = ${targetUserId}`;
          }
        }
        if (input.roles !== undefined) {
          await transaction`DELETE FROM user_roles WHERE user_id = ${targetUserId}`;
          for (const role of input.roles) {
            await transaction`
              INSERT INTO user_roles (user_id, role) VALUES (${targetUserId}, ${role})
            `;
          }
        }
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('E-mail já está em uso.');
      throw error;
    }

    return this.getUserDetail(targetUserId);
  }

  async getUserDetail(userId: string) {
    const sql = this.database.client;
    const [row] = await sql<AdminUserRow[]>`${adminUserSelect(sql)} WHERE u.id = ${userId}`;
    if (!row) throw new NotFoundException('Usuário não encontrado');
    return toAdminUser(row);
  }

  async botPersonaStats(): Promise<{
    friendshipsCount: number;
    gamesPlayed: number;
    personaUserIds: string[];
    total: number;
  }> {
    const sql = this.database.client;
    const personas = await sql<{ userId: string }[]>`SELECT user_id AS "userId" FROM bot_personas`;
    const [friendships] = await sql<{ count: number }[]>`
      SELECT count(*)::integer AS count
      FROM friendships
      WHERE status = 'accepted'
        AND (
          requester_id IN (SELECT user_id FROM bot_personas)
          OR addressee_id IN (SELECT user_id FROM bot_personas)
        )
    `;
    const [games] = await sql<{ count: number }[]>`
      SELECT count(*)::integer AS count
      FROM game_bots
      WHERE bot_user_id IN (SELECT user_id FROM bot_personas)
    `;
    return {
      friendshipsCount: friendships?.count ?? 0,
      gamesPlayed: games?.count ?? 0,
      personaUserIds: personas.map((persona) => persona.userId),
      total: personas.length,
    };
  }

  async listBotPersonas(): Promise<
    Array<{
      avatarUrl: string | null;
      displayName: string;
      targetRating: number;
      userId: string;
      username: string;
    }>
  > {
    return this.database.client`
      SELECT
        bp.user_id AS "userId",
        u.username::text AS username,
        p.display_name AS "displayName",
        p.avatar_url AS "avatarUrl",
        bp.target_rating AS "targetRating"
      FROM bot_personas bp
      JOIN users u ON u.id = bp.user_id
      JOIN user_profiles p ON p.user_id = bp.user_id
      ORDER BY p.display_name
    `;
  }

  async metrics(): Promise<{
    activeSubscriptionsByPlan: { count: number; planName: string }[];
    exercisesSolvedTotal: number;
    gamesPlayedToday: number;
    gamesPlayedTotal: number;
    lessonsCompletedTotal: number;
    newUsersLast7Days: number;
    referralsRewarded: number;
    referralsTotal: number;
    totalUsers: number;
  }> {
    const sql = this.database.client;
    const [users] = await sql<{ count: number }[]>`
      SELECT count(*)::integer AS count FROM users WHERE status = 'active'
    `;
    const [newUsers] = await sql<{ count: number }[]>`
      SELECT count(*)::integer AS count FROM users
       WHERE status = 'active' AND created_at >= now() - interval '7 days'
    `;
    const [games] = await sql<{ today: number; total: number }[]>`
      SELECT count(*)::integer AS total,
        count(*) FILTER (WHERE created_at >= date_trunc('day', now()))::integer AS today
      FROM games
    `;
    const [exercises] = await sql<{ count: number }[]>`
      SELECT count(*)::integer AS count FROM exercise_attempts WHERE correct = true
    `;
    const [lessons] = await sql<{ count: number }[]>`
      SELECT count(*)::integer AS count FROM lesson_attempts WHERE status = 'completed'
    `;
    const subscriptionsByPlan = await sql<{ count: number; planName: string }[]>`
      SELECT p.name AS "planName", count(*)::integer AS count
      FROM user_subscriptions s
      JOIN subscription_plans p ON p.id = s.plan_id
      WHERE s.status = 'active'
      GROUP BY p.name
      ORDER BY p.name
    `;
    const [referrals] = await sql<{ rewarded: number; total: number }[]>`
      SELECT count(*)::integer AS total,
        count(*) FILTER (WHERE status = 'rewarded')::integer AS rewarded
      FROM referrals
    `;
    return {
      activeSubscriptionsByPlan: subscriptionsByPlan,
      exercisesSolvedTotal: exercises?.count ?? 0,
      gamesPlayedToday: games?.today ?? 0,
      gamesPlayedTotal: games?.total ?? 0,
      lessonsCompletedTotal: lessons?.count ?? 0,
      newUsersLast7Days: newUsers?.count ?? 0,
      referralsRewarded: referrals?.rewarded ?? 0,
      referralsTotal: referrals?.total ?? 0,
      totalUsers: users?.count ?? 0,
    };
  }
}
