import { Injectable, NotFoundException } from '@nestjs/common';

import { toIsoString } from '../common/dates/to-iso-string.js';
import { DatabaseService } from '../database/database.service.js';

type PostRow = {
  author_display_name: string;
  author_id: string;
  author_username: string;
  body: string | null;
  created_at: Date | string;
  id: string;
  like_count: number;
  liked_by_me: boolean;
  photo_url: string | null;
};

const FEED_PAGE_SIZE = 30;

@Injectable()
export class FeedRepository {
  constructor(private readonly database: DatabaseService) {}

  async createPost(authorId: string, body: string | null, photoUrl: string | null) {
    const sql = this.database.client;
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO posts (author_id, body, photo_url)
      VALUES (${authorId}, ${body}, ${photoUrl})
      RETURNING id
    `;
    if (!row) throw new NotFoundException('Post não encontrado');
    return this.getPost(authorId, row.id);
  }

  async listFeed(viewerId: string, before: string | null) {
    const sql = this.database.client;
    const rows = await sql<PostRow[]>`
      SELECT p.id, p.author_id, u.username::text AS author_username,
             up.display_name AS author_display_name, p.body, p.photo_url, p.created_at,
             (SELECT count(*)::integer FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
             EXISTS(
               SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = ${viewerId}
             ) AS liked_by_me
      FROM posts p
      JOIN users u ON u.id = p.author_id
      JOIN user_profiles up ON up.user_id = p.author_id
      WHERE (
        p.author_id = ${viewerId}
        OR p.author_id IN (
          SELECT CASE WHEN f.requester_id = ${viewerId} THEN f.addressee_id ELSE f.requester_id END
          FROM friendships f
          WHERE f.status = 'accepted' AND (f.requester_id = ${viewerId} OR f.addressee_id = ${viewerId})
        )
      )
      AND (${before}::timestamptz IS NULL OR p.created_at < ${before}::timestamptz)
      ORDER BY p.created_at DESC
      LIMIT ${FEED_PAGE_SIZE}
    `;
    return rows.map((row) => this.toPost(viewerId, row));
  }

  async deletePost(userId: string, postId: string) {
    const result = await this.database.client`
      DELETE FROM posts WHERE id = ${postId} AND author_id = ${userId}
    `;
    if (result.count === 0) throw new NotFoundException('Post não encontrado');
  }

  async like(userId: string, postId: string) {
    const sql = this.database.client;
    const [post] = await sql<{ id: string }[]>`SELECT id FROM posts WHERE id = ${postId}`;
    if (!post) throw new NotFoundException('Post não encontrado');
    await sql`
      INSERT INTO post_likes (post_id, user_id) VALUES (${postId}, ${userId})
      ON CONFLICT (post_id, user_id) DO NOTHING
    `;
    return this.getPost(userId, postId);
  }

  async unlike(userId: string, postId: string) {
    await this.database.client`
      DELETE FROM post_likes WHERE post_id = ${postId} AND user_id = ${userId}
    `;
  }

  private async getPost(viewerId: string, postId: string) {
    const [row] = await this.database.client<PostRow[]>`
      SELECT p.id, p.author_id, u.username::text AS author_username,
             up.display_name AS author_display_name, p.body, p.photo_url, p.created_at,
             (SELECT count(*)::integer FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
             EXISTS(
               SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = ${viewerId}
             ) AS liked_by_me
      FROM posts p
      JOIN users u ON u.id = p.author_id
      JOIN user_profiles up ON up.user_id = p.author_id
      WHERE p.id = ${postId}
    `;
    if (!row) throw new NotFoundException('Post não encontrado');
    return this.toPost(viewerId, row);
  }

  private toPost(viewerId: string, row: PostRow) {
    return {
      authorDisplayName: row.author_display_name,
      authorId: row.author_id,
      authorUsername: row.author_username,
      body: row.body,
      createdAt: toIsoString(row.created_at),
      id: row.id,
      likeCount: row.like_count,
      likedByMe: row.liked_by_me,
      mine: row.author_id === viewerId,
      photoUrl: row.photo_url,
    };
  }
}
