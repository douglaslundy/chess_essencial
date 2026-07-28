import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';

export interface ProgressRow {
  currentLevelId: string | null;
  currentWorldId: string | null;
  highestUnlockedLevelId: string | null;
  streakDays: number;
  xp: number;
}

export interface RankedLevelRow {
  completedStageCount: number;
  id: string;
  isCapstone: boolean;
  position: number;
  rank: number;
  stageCount: number;
  title: string;
  worldDescription: string;
  worldId: string;
  worldPosition: number;
  worldTitle: string;
}

export interface StageRow {
  completedAt: string | null;
  id: string;
  position: number;
  type: 'challenge' | 'lesson' | 'review' | 'checkpoint' | 'boss';
}

@Injectable()
export class LearningPathRepository {
  constructor(private readonly database: DatabaseService) {}

  /** Creates the progress row on first access, anchored at the very first level of the curriculum. */
  async getOrInitProgress(userId: string): Promise<ProgressRow | null> {
    const sql = this.database.client;
    const existing = await sql<ProgressRow[]>`
      SELECT current_world_id AS "currentWorldId", current_level_id AS "currentLevelId",
             highest_unlocked_level_id AS "highestUnlockedLevelId", xp, streak_days AS "streakDays"
        FROM user_learning_progress
       WHERE user_id = ${userId}
    `;
    if (existing[0]) return existing[0];

    const [first] = await sql<{ levelId: string; worldId: string }[]>`
      SELECT ll.id AS "levelId", lw.id AS "worldId"
        FROM learning_levels ll
        JOIN learning_worlds lw ON lw.id = ll.world_id
       ORDER BY lw.position, ll.position
       LIMIT 1
    `;
    if (!first) return null; // Curriculum not seeded yet.

    await sql`
      INSERT INTO user_learning_progress (user_id, current_world_id, current_level_id, highest_unlocked_level_id)
      VALUES (${userId}, ${first.worldId}, ${first.levelId}, ${first.levelId})
      ON CONFLICT (user_id) DO NOTHING
    `;
    const [created] = await sql<ProgressRow[]>`
      SELECT current_world_id AS "currentWorldId", current_level_id AS "currentLevelId",
             highest_unlocked_level_id AS "highestUnlockedLevelId", xp, streak_days AS "streakDays"
        FROM user_learning_progress
       WHERE user_id = ${userId}
    `;
    return created ?? null;
  }

  /** Every level in curriculum order, ranked globally, with per-user stage-completion counts. */
  async listRankedLevels(userId: string): Promise<RankedLevelRow[]> {
    const sql = this.database.client;
    return sql<RankedLevelRow[]>`
      SELECT ll.id, ll.position, ll.title, ll.world_id AS "worldId",
             lw.title AS "worldTitle", lw.description AS "worldDescription", lw.position AS "worldPosition",
             (ROW_NUMBER() OVER (ORDER BY lw.position, ll.position))::int AS rank,
             EXISTS (
               SELECT 1 FROM learning_stages ls
                WHERE ls.level_id = ll.id AND ls.type IN ('checkpoint', 'boss')
             ) AS "isCapstone",
             (SELECT count(*)::int FROM learning_stages ls WHERE ls.level_id = ll.id) AS "stageCount",
             (
               SELECT count(*)::int
                 FROM learning_stages ls
                 JOIN user_stage_completions usc
                   ON usc.stage_id = ls.id AND usc.user_id = ${userId} AND usc.status = 'completed'
                WHERE ls.level_id = ll.id
             ) AS "completedStageCount"
        FROM learning_levels ll
        JOIN learning_worlds lw ON lw.id = ll.world_id
       ORDER BY lw.position, ll.position
    `;
  }

  async getLevelRank(levelId: string): Promise<number | null> {
    const sql = this.database.client;
    const [row] = await sql<{ rank: number }[]>`
      SELECT (ROW_NUMBER() OVER (ORDER BY lw.position, ll.position))::int AS rank
        FROM learning_levels ll
        JOIN learning_worlds lw ON lw.id = ll.world_id
       WHERE ll.id = ${levelId}
    `;
    return row?.rank ?? null;
  }

  async getStagesForLevel(levelId: string, userId: string): Promise<StageRow[]> {
    const sql = this.database.client;
    return sql<StageRow[]>`
      SELECT ls.id, ls.position, ls.type, usc.completed_at AS "completedAt"
        FROM learning_stages ls
        LEFT JOIN user_stage_completions usc
          ON usc.stage_id = ls.id AND usc.user_id = ${userId} AND usc.status = 'completed'
       WHERE ls.level_id = ${levelId}
       ORDER BY ls.position
    `;
  }
}
