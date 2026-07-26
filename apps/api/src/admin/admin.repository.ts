import type { AdminUserSearchQuery, UpdateAdminUserStatusInput } from '@xadrez/contracts';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { toIsoString } from '../common/dates/to-iso-string.js';
import { DatabaseService } from '../database/database.service.js';

type AdminUserRow = {
  avatar_url: string | null;
  created_at: Date | string;
  display_name: string | null;
  email: string;
  id: string;
  is_admin: boolean;
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
    status: row.status,
    username: row.username,
  };
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
    const rows = await sql<AdminUserRow[]>`
      SELECT u.id, u.email, u.username, u.status, u.created_at,
        p.display_name, p.avatar_url,
        EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role = 'admin') AS is_admin
        FROM users u
        LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE (${status}::text IS NULL OR u.status = ${status}::user_status)
         AND (${q}::text IS NULL OR concat_ws(' ', u.username, u.email) ILIKE '%' || ${q} || '%')
       ORDER BY u.created_at DESC
       LIMIT ${query.limit} OFFSET ${query.offset}
    `;
    return { items: rows.map(toAdminUser), total: count?.total ?? 0 };
  }

  async updateStatus(
    actingUserId: string,
    targetUserId: string,
    input: UpdateAdminUserStatusInput,
  ) {
    const sql = this.database.client;
    if (actingUserId === targetUserId) {
      throw new BadRequestException('Você não pode alterar o seu próprio status.');
    }
    const [target] = await sql<{ is_admin: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = ${targetUserId} AND r.role = 'admin') AS is_admin
        FROM users u WHERE u.id = ${targetUserId}
    `;
    if (!target) throw new NotFoundException('Usuário não encontrado');
    if (target.is_admin) {
      throw new BadRequestException('Não é possível alterar o status de outro administrador.');
    }
    const [updated] = await sql<AdminUserRow[]>`
      UPDATE users u SET status = ${input.status}::user_status, updated_at = now()
       WHERE u.id = ${targetUserId}
       RETURNING u.id, u.email, u.username, u.status, u.created_at,
         (SELECT p.display_name FROM user_profiles p WHERE p.user_id = u.id) AS display_name,
         false AS is_admin
    `;
    if (!updated) throw new NotFoundException('Usuário não encontrado');
    // Suspending or deleting a user revokes their active sessions.
    if (input.status !== 'active') {
      await sql`DELETE FROM user_sessions WHERE user_id = ${targetUserId}`;
    }
    return toAdminUser(updated);
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
