import { randomInt, randomUUID } from 'node:crypto';

import { ChessJsRules } from '@xadrez/chess-domain';
import type {
  CreateChallengeInput,
  JoinQueueInput,
  QueueStatus,
  RespondChallengeInput,
  TimeControlCode,
} from '@xadrez/contracts';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { TransactionSql } from 'postgres';

import { DatabaseService } from '../../database/database.service.js';

interface TimeControlRow {
  code: TimeControlCode;
  id: string;
  initialMs: number;
  pool: QueueStatus['pool'];
  rated: boolean;
}

interface QueueRow {
  enqueuedAt: Date | string;
  rating: number;
  userId: string;
}

@Injectable()
export class MatchmakingRepository {
  constructor(private readonly database: DatabaseService) {}

  async join(userId: string, input: JoinQueueInput): Promise<QueueStatus> {
    return this.database.client.begin(async (transaction) => {
      const timeControl = await this.timeControl(transaction, input.timeControlCode);
      await transaction`SELECT pg_advisory_xact_lock(hashtextextended(${`matchmaking:${timeControl.id}`}, 0))`;
      const rating = await this.rating(transaction, userId, timeControl.pool);
      const now = new Date();

      await transaction`
        INSERT INTO matchmaking_queue (
          user_id, pool, time_control_id, rating, min_rating, max_rating,
          enqueued_at, heartbeat_at
        ) VALUES (
          ${userId}, ${timeControl.pool}::rating_pool, ${timeControl.id}, ${rating},
          ${rating - 100}, ${rating + 100}, ${now.toISOString()}, ${now.toISOString()}
        )
        ON CONFLICT (user_id) DO UPDATE SET
          pool = EXCLUDED.pool, time_control_id = EXCLUDED.time_control_id,
          rating = EXCLUDED.rating, min_rating = EXCLUDED.min_rating,
          max_rating = EXCLUDED.max_rating, heartbeat_at = EXCLUDED.heartbeat_at
      `;

      const [self] = await transaction<QueueRow[]>`
        SELECT user_id AS "userId", rating, enqueued_at AS "enqueuedAt"
        FROM matchmaking_queue WHERE user_id = ${userId}
      `;
      if (!self) throw new ConflictException('Queue entry was not persisted');
      const selfEnqueuedAt = new Date(self.enqueuedAt);
      const selfRange = Math.min(
        800,
        100 + Math.floor(Math.max(0, now.getTime() - selfEnqueuedAt.getTime()) / 15_000) * 50,
      );

      const [candidate] = await transaction<QueueRow[]>`
        SELECT queue.user_id AS "userId", queue.rating, queue.enqueued_at AS "enqueuedAt"
        FROM matchmaking_queue queue
        WHERE queue.time_control_id = ${timeControl.id}
          AND queue.user_id <> ${userId}
          AND queue.rating BETWEEN
            ${rating}::integer - ${selfRange}::integer
            AND
            ${rating}::integer + ${selfRange}::integer
          AND ${rating}::integer BETWEEN
            queue.rating - LEAST(800, 100 + floor(EXTRACT(EPOCH FROM (now() - queue.enqueued_at)) / 15) * 50)
            AND
            queue.rating + LEAST(800, 100 + floor(EXTRACT(EPOCH FROM (now() - queue.enqueued_at)) / 15) * 50)
          AND NOT EXISTS (
            SELECT 1 FROM friendships
            WHERE status = 'blocked'
              AND ((requester_id = ${userId} AND addressee_id = queue.user_id)
                OR (requester_id = queue.user_id AND addressee_id = ${userId}))
          )
          AND NOT EXISTS (
            SELECT 1 FROM user_blocks
            WHERE (blocker_user_id = ${userId} AND blocked_user_id = queue.user_id)
               OR (blocker_user_id = queue.user_id AND blocked_user_id = ${userId})
          )
        ORDER BY
          EXISTS (
            SELECT 1
            FROM game_players mine
            JOIN game_players theirs ON theirs.game_id = mine.game_id
            JOIN games recent_game ON recent_game.id = mine.game_id
            WHERE mine.user_id = ${userId} AND theirs.user_id = queue.user_id
              AND recent_game.finished_at > now() - interval '24 hours'
          ),
          abs(queue.rating - ${rating}::integer),
          queue.enqueued_at
        FOR UPDATE OF queue SKIP LOCKED
        LIMIT 1
      `;

      if (!candidate) {
        return {
          status: 'queued',
          pool: timeControl.pool,
          timeControlCode: timeControl.code,
          minRating: rating - selfRange,
          maxRating: rating + selfRange,
          enqueuedAt: selfEnqueuedAt.toISOString(),
        };
      }

      const creatorColor = await this.chooseColor(transaction, userId, candidate.userId);
      const gameId = await this.createGame(
        transaction,
        userId,
        candidate.userId,
        creatorColor,
        timeControl,
      );
      await transaction`
        DELETE FROM matchmaking_queue
        WHERE user_id IN (${userId}, ${candidate.userId})
      `;

      return {
        status: 'matched',
        pool: timeControl.pool,
        timeControlCode: timeControl.code,
        minRating: rating - selfRange,
        maxRating: rating + selfRange,
        enqueuedAt: selfEnqueuedAt.toISOString(),
        gameId,
      };
    });
  }

  async leave(userId: string) {
    const result = await this.database.client`
      DELETE FROM matchmaking_queue WHERE user_id = ${userId}
    `;
    return result.count > 0;
  }

  async createChallenge(userId: string, input: CreateChallengeInput) {
    if (userId === input.challengedUserId) {
      throw new BadRequestException('Players must be different');
    }

    return this.database.client.begin(async (transaction) => {
      const timeControl = await this.timeControl(transaction, input.timeControlCode);
      const [challenged] = await transaction<{ id: string }[]>`
        SELECT id FROM users WHERE id = ${input.challengedUserId} AND status = 'active'
      `;
      if (!challenged) throw new NotFoundException('Active challenged user not found');

      const [blocked] = await transaction<{ present: boolean }[]>`
        SELECT true AS present
        WHERE EXISTS (
          SELECT 1 FROM friendships
          WHERE status = 'blocked'
            AND ((requester_id = ${userId} AND addressee_id = ${input.challengedUserId})
              OR (requester_id = ${input.challengedUserId} AND addressee_id = ${userId}))
        ) OR EXISTS (
          SELECT 1 FROM user_blocks
          WHERE (blocker_user_id = ${userId} AND blocked_user_id = ${input.challengedUserId})
             OR (blocker_user_id = ${input.challengedUserId} AND blocked_user_id = ${userId})
        ) OR EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_id = ${input.challengedUserId} AND allow_challenges = false
        )
      `;
      if (blocked) throw new ForbiddenException('Challenge is not allowed');

      const [pending] = await transaction<{ id: string }[]>`
        SELECT id FROM direct_challenges
        WHERE status = 'pending'
          AND ((challenger_id = ${userId} AND challenged_id = ${input.challengedUserId})
            OR (challenger_id = ${input.challengedUserId} AND challenged_id = ${userId}))
        FOR UPDATE
      `;
      if (pending) throw new ConflictException('A pending challenge already exists');

      const challengeId = randomUUID();
      const expiresAt = new Date(Date.now() + 10 * 60_000);
      await transaction`
        INSERT INTO direct_challenges (
          id, challenger_id, challenged_id, time_control_id,
          challenger_color, expires_at
        ) VALUES (
          ${challengeId}, ${userId}, ${input.challengedUserId}, ${timeControl.id},
          ${input.challengerColor}::color_side, ${expiresAt.toISOString()}
        )
      `;
      return { id: challengeId, status: 'pending', expiresAt: expiresAt.toISOString() };
    });
  }

  async respondChallenge(userId: string, challengeId: string, input: RespondChallengeInput) {
    return this.database.client.begin(async (transaction) => {
      const [challenge] = await transaction<
        {
          challengedId: string;
          challengerColor: 'white' | 'black' | null;
          challengerId: string;
          expiresAt: Date | string;
          status: string;
          timeControlId: string;
        }[]
      >`
        SELECT challenged_id AS "challengedId", challenger_id AS "challengerId",
               challenger_color AS "challengerColor", expires_at AS "expiresAt",
               status, time_control_id AS "timeControlId"
        FROM direct_challenges
        WHERE id = ${challengeId}
        FOR UPDATE
      `;
      if (!challenge) throw new NotFoundException('Challenge not found');
      if (challenge.challengedId !== userId) {
        throw new ForbiddenException('Challenge belongs to another user');
      }
      if (challenge.status !== 'pending') {
        throw new ConflictException('Challenge is no longer pending');
      }
      if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
        await transaction`
          UPDATE direct_challenges SET status = 'expired', resolved_at = now()
          WHERE id = ${challengeId}
        `;
        throw new ConflictException('Challenge expired');
      }

      if (!input.accept) {
        await transaction`
          UPDATE direct_challenges SET status = 'declined', resolved_at = now()
          WHERE id = ${challengeId}
        `;
        return { id: challengeId, status: 'declined' };
      }

      const [timeControl] = await transaction<TimeControlRow[]>`
        SELECT id, code, pool, initial_ms AS "initialMs", rated
        FROM game_time_controls
        WHERE id = ${challenge.timeControlId} AND active = true
      `;
      if (!timeControl) throw new ConflictException('Time control is no longer active');
      const challengerColor = challenge.challengerColor ?? (randomInt(2) === 0 ? 'white' : 'black');
      const gameId = await this.createGame(
        transaction,
        challenge.challengerId,
        challenge.challengedId,
        challengerColor,
        timeControl,
      );
      await transaction`
        UPDATE direct_challenges
        SET status = 'accepted', game_id = ${gameId}, resolved_at = now()
        WHERE id = ${challengeId}
      `;
      await transaction`
        DELETE FROM matchmaking_queue
        WHERE user_id IN (${challenge.challengerId}, ${challenge.challengedId})
      `;
      return { id: challengeId, status: 'accepted', gameId };
    });
  }

  private async timeControl(transaction: TransactionSql, code: string): Promise<TimeControlRow> {
    const [row] = await transaction<TimeControlRow[]>`
      SELECT id, code, pool, initial_ms AS "initialMs", rated
      FROM game_time_controls
      WHERE code = ${code} AND active = true
    `;
    if (!row) throw new NotFoundException('Time control not found');
    return row;
  }

  private async rating(transaction: TransactionSql, userId: string, pool: string) {
    const [activeUser] = await transaction<{ id: string }[]>`
      SELECT id FROM users WHERE id = ${userId} AND status = 'active'
    `;
    if (!activeUser) throw new ForbiddenException('Active user required');
    const [profile] = await transaction<{ rating: number }[]>`
      SELECT rating FROM rating_profiles
      WHERE user_id = ${userId} AND pool = ${pool}::rating_pool
    `;
    return profile?.rating ?? 1200;
  }

  private async chooseColor(
    transaction: TransactionSql,
    firstUserId: string,
    secondUserId: string,
  ): Promise<'white' | 'black'> {
    const balances = await transaction<{ balance: number; userId: string }[]>`
      SELECT selected.user_id AS "userId",
             COALESCE(sum(CASE game_players.color WHEN 'white' THEN 1 ELSE -1 END), 0)::integer AS balance
      FROM (VALUES (${firstUserId}::uuid), (${secondUserId}::uuid)) selected(user_id)
      LEFT JOIN LATERAL (
        SELECT color FROM game_players
        WHERE user_id = selected.user_id
        ORDER BY game_id DESC LIMIT 20
      ) game_players ON true
      GROUP BY selected.user_id
    `;
    const firstBalance = balances.find((row) => row.userId === firstUserId)?.balance ?? 0;
    const secondBalance = balances.find((row) => row.userId === secondUserId)?.balance ?? 0;
    if (firstBalance > secondBalance) return 'black';
    if (firstBalance < secondBalance) return 'white';
    return randomInt(2) === 0 ? 'white' : 'black';
  }

  private async createGame(
    transaction: TransactionSql,
    creatorUserId: string,
    opponentUserId: string,
    creatorColor: 'white' | 'black',
    timeControl: TimeControlRow,
  ) {
    const activeUsers = await transaction<{ id: string }[]>`
      SELECT id FROM users
      WHERE id IN (${creatorUserId}, ${opponentUserId}) AND status = 'active'
    `;
    if (activeUsers.length !== 2) throw new ConflictException('Both players must be active');

    const gameId = randomUUID();
    const currentFen = new ChessJsRules().fen();
    const opponentColor = creatorColor === 'white' ? 'black' : 'white';
    const creatorRating = await this.rating(transaction, creatorUserId, timeControl.pool);
    const opponentRating = await this.rating(transaction, opponentUserId, timeControl.pool);

    await transaction`
      INSERT INTO games (
        id, status, result, termination, time_control_id, rated,
        initial_fen, current_fen, side_to_move, white_clock_ms,
        black_clock_ms, active_clock_started_at, started_at
      ) VALUES (
        ${gameId}, 'active', 'none', 'none', ${timeControl.id}, ${timeControl.rated},
        'startpos', ${currentFen}, 'white', ${timeControl.initialMs},
        ${timeControl.initialMs}, now(), now()
      )
    `;
    await transaction`
      INSERT INTO game_players (game_id, user_id, color, rating_before)
      VALUES
        (${gameId}, ${creatorUserId}, ${creatorColor}, ${creatorRating}),
        (${gameId}, ${opponentUserId}, ${opponentColor}, ${opponentRating})
    `;
    await transaction`
      INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
      VALUES ('game', ${gameId}, 'game.created', ${JSON.stringify({
        gameId,
        source: 'matchmaking',
      })}::jsonb)
    `;
    return gameId;
  }
}
