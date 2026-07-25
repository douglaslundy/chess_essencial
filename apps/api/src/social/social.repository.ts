import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { toIsoString, toIsoStringOrNull } from '../common/dates/to-iso-string.js';
import { DatabaseService } from '../database/database.service.js';

type FriendRow = {
  avatar_url: string | null;
  display_name: string;
  last_seen_at: Date | string | null;
  user_id: string;
  username: string;
};

type RequestRow = FriendRow & { created_at: Date | string };

@Injectable()
export class SocialRepository {
  constructor(private readonly database: DatabaseService) {}

  private async targetUser(username: string) {
    const sql = this.database.client;
    const [user] = await sql<{ id: string; status: string }[]>`
      SELECT id, status FROM users WHERE username = ${username}
    `;
    return user ?? null;
  }

  private async isBlockedEitherWay(userId: string, otherId: string) {
    const sql = this.database.client;
    const [blocked] = await sql<{ present: boolean }[]>`
      SELECT true AS present FROM user_blocks
       WHERE (blocker_user_id = ${userId} AND blocked_user_id = ${otherId})
          OR (blocker_user_id = ${otherId} AND blocked_user_id = ${userId})
    `;
    return Boolean(blocked);
  }

  async sendRequest(requesterId: string, username: string) {
    const sql = this.database.client;
    const target = await this.targetUser(username);
    if (!target || target.status !== 'active')
      throw new NotFoundException('Usuário não encontrado');
    if (target.id === requesterId) throw new BadRequestException('Você não pode se adicionar.');
    if (await this.isBlockedEitherWay(requesterId, target.id)) {
      throw new BadRequestException('Não é possível enviar pedido para este usuário.');
    }
    const [existing] = await sql<{ status: string }[]>`
      SELECT status FROM friendships
       WHERE (requester_id = ${requesterId} AND addressee_id = ${target.id})
          OR (requester_id = ${target.id} AND addressee_id = ${requesterId})
    `;
    if (existing) {
      if (existing.status === 'accepted') throw new ConflictException('Vocês já são amigos.');
      throw new ConflictException('Já existe um pedido pendente.');
    }
    const [created] = await sql<RequestRow[]>`
      WITH inserted AS (
        INSERT INTO friendships (requester_id, addressee_id, status)
        VALUES (${requesterId}, ${target.id}, 'pending')
        RETURNING addressee_id, created_at
      )
      SELECT u.id AS user_id, u.username::text, p.display_name, p.avatar_url, inserted.created_at
        FROM inserted
        JOIN users u ON u.id = inserted.addressee_id
        JOIN user_profiles p ON p.user_id = u.id
    `;
    if (!created) throw new NotFoundException('Pedido não encontrado');
    return this.toRequest(created);
  }

  async respondToRequest(addresseeId: string, requesterUsername: string, accept: boolean) {
    const sql = this.database.client;
    const requester = await this.targetUser(requesterUsername);
    if (!requester) throw new NotFoundException('Pedido não encontrado');
    if (accept) {
      const result = await sql`
        UPDATE friendships SET status = 'accepted', updated_at = now()
         WHERE requester_id = ${requester.id} AND addressee_id = ${addresseeId} AND status = 'pending'
      `;
      if (result.count === 0) throw new NotFoundException('Pedido não encontrado');
      return this.toFriend(await this.friendRow(addresseeId, requester.id));
    }
    const result = await sql`
      DELETE FROM friendships
       WHERE requester_id = ${requester.id} AND addressee_id = ${addresseeId} AND status = 'pending'
    `;
    if (result.count === 0) throw new NotFoundException('Pedido não encontrado');
    return null;
  }

  async cancelRequest(requesterId: string, addresseeUsername: string) {
    const sql = this.database.client;
    const addressee = await this.targetUser(addresseeUsername);
    if (!addressee) throw new NotFoundException('Pedido não encontrado');
    const result = await sql`
      DELETE FROM friendships
       WHERE requester_id = ${requesterId} AND addressee_id = ${addressee.id} AND status = 'pending'
    `;
    if (result.count === 0) throw new NotFoundException('Pedido não encontrado');
  }

  async removeFriend(userId: string, friendId: string) {
    const sql = this.database.client;
    const result = await sql`
      DELETE FROM friendships
       WHERE status = 'accepted'
         AND ((requester_id = ${userId} AND addressee_id = ${friendId})
           OR (requester_id = ${friendId} AND addressee_id = ${userId}))
    `;
    if (result.count === 0) throw new NotFoundException('Amizade não encontrada');
  }

  async listFriends(userId: string) {
    const sql = this.database.client;
    const rows = await sql<FriendRow[]>`
      SELECT u.id AS user_id, u.username::text, p.display_name, p.avatar_url, u.last_seen_at
        FROM friendships f
        JOIN users u ON u.id = CASE WHEN f.requester_id = ${userId} THEN f.addressee_id ELSE f.requester_id END
        JOIN user_profiles p ON p.user_id = u.id
       WHERE f.status = 'accepted' AND (f.requester_id = ${userId} OR f.addressee_id = ${userId})
       ORDER BY p.display_name
    `;
    return rows.map((row) => this.toFriend(row));
  }

  async listRequests(userId: string) {
    const sql = this.database.client;
    const incoming = await sql<RequestRow[]>`
      SELECT u.id AS user_id, u.username::text, p.display_name, p.avatar_url, f.created_at
        FROM friendships f
        JOIN users u ON u.id = f.requester_id
        JOIN user_profiles p ON p.user_id = u.id
       WHERE f.addressee_id = ${userId} AND f.status = 'pending'
       ORDER BY f.created_at DESC
    `;
    const outgoing = await sql<RequestRow[]>`
      SELECT u.id AS user_id, u.username::text, p.display_name, p.avatar_url, f.created_at
        FROM friendships f
        JOIN users u ON u.id = f.addressee_id
        JOIN user_profiles p ON p.user_id = u.id
       WHERE f.requester_id = ${userId} AND f.status = 'pending'
       ORDER BY f.created_at DESC
    `;
    return {
      incoming: incoming.map((row) => this.toRequest(row)),
      outgoing: outgoing.map((row) => this.toRequest(row)),
    };
  }

  async publicProfile(viewerId: string | null, username: string) {
    const sql = this.database.client;
    const [row] = await sql<
      {
        avatar_url: string | null;
        display_name: string;
        id: string;
        last_seen_at: Date | string | null;
        username: string;
      }[]
    >`
      SELECT u.id, u.username::text, p.display_name, p.avatar_url, u.last_seen_at
        FROM users u JOIN user_profiles p ON p.user_id = u.id
       WHERE u.username = ${username} AND u.status = 'active'
    `;
    if (!row) throw new NotFoundException('Usuário não encontrado');
    const ratings = await sql<{ pool: string; rating: number }[]>`
      SELECT pool, rating FROM rating_profiles WHERE user_id = ${row.id} ORDER BY pool
    `;
    let friendshipStatus: 'none' | 'pending_outgoing' | 'pending_incoming' | 'friends' | 'self' =
      'none';
    if (viewerId) {
      if (viewerId === row.id) friendshipStatus = 'self';
      else {
        const [friendship] = await sql<{ requester_id: string; status: string }[]>`
          SELECT requester_id, status FROM friendships
           WHERE (requester_id = ${viewerId} AND addressee_id = ${row.id})
              OR (requester_id = ${row.id} AND addressee_id = ${viewerId})
        `;
        if (friendship?.status === 'accepted') friendshipStatus = 'friends';
        else if (friendship?.status === 'pending') {
          friendshipStatus =
            friendship.requester_id === viewerId ? 'pending_outgoing' : 'pending_incoming';
        }
      }
    }
    return {
      avatarUrl: row.avatar_url,
      displayName: row.display_name,
      friendshipStatus,
      lastSeenAt: row.last_seen_at,
      ratings: ratings.map((rating) => ({ pool: rating.pool, rating: rating.rating })),
      userId: row.id,
      username: row.username,
    };
  }

  async touchLastSeen(userId: string) {
    await this.database.client`UPDATE users SET last_seen_at = now() WHERE id = ${userId}`;
  }

  private async friendRow(userId: string, otherId: string): Promise<FriendRow> {
    const sql = this.database.client;
    const [row] = await sql<FriendRow[]>`
      SELECT u.id AS user_id, u.username::text, p.display_name, p.avatar_url, u.last_seen_at
        FROM users u JOIN user_profiles p ON p.user_id = u.id
       WHERE u.id = ${otherId}
    `;
    if (!row) throw new NotFoundException('Usuário não encontrado');
    return row;
  }

  private toFriend(row: FriendRow) {
    return {
      avatarUrl: row.avatar_url,
      displayName: row.display_name,
      presence: { lastSeenAt: toIsoStringOrNull(row.last_seen_at), online: false },
      userId: row.user_id,
      username: row.username,
    };
  }

  private toRequest(row: RequestRow) {
    return {
      avatarUrl: row.avatar_url,
      createdAt: toIsoString(row.created_at),
      displayName: row.display_name,
      userId: row.user_id,
      username: row.username,
    };
  }
}
