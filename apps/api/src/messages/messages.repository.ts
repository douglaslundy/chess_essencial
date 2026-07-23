import { ForbiddenException, Injectable } from '@nestjs/common';

import { toIsoString, toIsoStringOrNull } from '../common/dates/to-iso-string.js';
import { DatabaseService } from '../database/database.service.js';

type ConversationRow = {
  display_name: string;
  last_body: string | null;
  last_created_at: Date | string | null;
  last_seen_at: Date | string | null;
  last_sender_id: string | null;
  unread_count: number;
  user_id: string;
  username: string;
};

type MessageRow = {
  body: string;
  created_at: Date | string;
  id: string;
  recipient_id: string;
  sender_id: string;
};

const MESSAGE_PAGE_SIZE = 50;

@Injectable()
export class MessagesRepository {
  constructor(private readonly database: DatabaseService) {}

  private async isFriend(userId: string, otherId: string): Promise<boolean> {
    const [row] = await this.database.client<{ present: boolean }[]>`
      SELECT true AS present FROM friendships
       WHERE status = 'accepted'
         AND ((requester_id = ${userId} AND addressee_id = ${otherId})
           OR (requester_id = ${otherId} AND addressee_id = ${userId}))
    `;
    return Boolean(row);
  }

  async listConversations(userId: string) {
    const sql = this.database.client;
    const rows = await sql<ConversationRow[]>`
      SELECT u.id AS user_id, u.username::text, up.display_name, u.last_seen_at,
             last_msg.body AS last_body, last_msg.created_at AS last_created_at,
             last_msg.sender_id AS last_sender_id, COALESCE(unread.count, 0) AS unread_count
      FROM friendships f
      JOIN users u ON u.id = CASE WHEN f.requester_id = ${userId} THEN f.addressee_id ELSE f.requester_id END
      JOIN user_profiles up ON up.user_id = u.id
      LEFT JOIN LATERAL (
        SELECT body, created_at, sender_id
        FROM direct_messages
        WHERE (sender_id = ${userId} AND recipient_id = u.id)
           OR (sender_id = u.id AND recipient_id = ${userId})
        ORDER BY created_at DESC
        LIMIT 1
      ) last_msg ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::integer AS count
        FROM direct_messages
        WHERE recipient_id = ${userId} AND sender_id = u.id AND read_at IS NULL
      ) unread ON true
      WHERE f.status = 'accepted' AND (f.requester_id = ${userId} OR f.addressee_id = ${userId})
      ORDER BY last_msg.created_at DESC NULLS LAST, up.display_name
    `;
    return rows.map((row) => ({
      displayName: row.display_name,
      lastMessage: row.last_created_at
        ? {
            body: row.last_body ?? '',
            createdAt: toIsoString(row.last_created_at),
            mine: row.last_sender_id === userId,
          }
        : null,
      lastSeenAt: toIsoStringOrNull(row.last_seen_at),
      unreadCount: row.unread_count,
      userId: row.user_id,
      username: row.username,
    }));
  }

  async listMessages(userId: string, friendId: string, before: string | null) {
    if (!(await this.isFriend(userId, friendId))) {
      throw new ForbiddenException('Vocês precisam ser amigos para trocar mensagens.');
    }
    const sql = this.database.client;
    await sql`
      UPDATE direct_messages SET read_at = now()
       WHERE recipient_id = ${userId} AND sender_id = ${friendId} AND read_at IS NULL
    `;
    const rows = await sql<MessageRow[]>`
      SELECT id, sender_id, recipient_id, body, created_at
      FROM direct_messages
      WHERE (
        (sender_id = ${userId} AND recipient_id = ${friendId})
        OR (sender_id = ${friendId} AND recipient_id = ${userId})
      )
      AND (${before}::timestamptz IS NULL OR created_at < ${before}::timestamptz)
      ORDER BY created_at DESC
      LIMIT ${MESSAGE_PAGE_SIZE}
    `;
    return rows.reverse().map((row) => this.toMessage(userId, row));
  }

  async sendMessage(senderId: string, recipientId: string, body: string) {
    if (!(await this.isFriend(senderId, recipientId))) {
      throw new ForbiddenException('Vocês precisam ser amigos para trocar mensagens.');
    }
    const [row] = await this.database.client<MessageRow[]>`
      INSERT INTO direct_messages (sender_id, recipient_id, body)
      VALUES (${senderId}, ${recipientId}, ${body})
      RETURNING id, sender_id, recipient_id, body, created_at
    `;
    if (!row) throw new Error('unexpected missing insert result');
    return this.toMessage(senderId, row);
  }

  private toMessage(viewerId: string, row: MessageRow) {
    return {
      body: row.body,
      createdAt: toIsoString(row.created_at),
      id: row.id,
      mine: row.sender_id === viewerId,
      recipientId: row.recipient_id,
      senderId: row.sender_id,
    };
  }
}
