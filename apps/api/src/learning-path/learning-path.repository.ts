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

  /**
   * Creates the progress row on first access. FASE 5 do spec: a user with
   * enough real exercise history (outside the Jornada entirely — the same
   * exercise_attempts table the rest of the platform has always used)
   * shouldn't be forced through Mundo 1 from scratch. Anchors at the
   * estimated level when there's reliable signal, otherwise falls back to
   * the curriculum's very first level exactly as before.
   */
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

    const placement = await this.estimatePlacementLevel(userId);
    const target = placement ?? first;

    await sql`
      INSERT INTO user_learning_progress (
        user_id, current_world_id, current_level_id, highest_unlocked_level_id, placement_level_id
      )
      VALUES (
        ${userId}, ${target.worldId}, ${target.levelId}, ${target.levelId},
        ${placement?.levelId ?? null}
      )
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

  /**
   * Estimates a starting level from the user's last 30 correctly-solved
   * exercises that have a difficulty_score (the same scale learning_levels'
   * difficulty_min/max are built from) — deliberately simple, matches the
   * spirit of every other sampling heuristic in this module (no exponential
   * decay, no separate model). Returns null when there isn't enough
   * history to trust (fewer than 10 such attempts), per the spec's
   * explicit "no reliable history -> keep a configurable starting point"
   * fallback — callers then default to the curriculum's first level.
   */
  private async estimatePlacementLevel(
    userId: string,
  ): Promise<{ levelId: string; worldId: string } | null> {
    const sql = this.database.client;
    const [stats] = await sql<{ estimate: number | null; sampleSize: number }[]>`
      WITH recent_correct AS (
        SELECT e.difficulty_score
          FROM exercise_attempts ea
          JOIN exercises e ON e.id = ea.exercise_id
         WHERE ea.user_id = ${userId} AND ea.correct = true AND e.difficulty_score IS NOT NULL
         ORDER BY ea.attempted_at DESC
         LIMIT 30
      )
      SELECT avg(difficulty_score)::numeric AS estimate, count(*)::int AS "sampleSize"
        FROM recent_correct
    `;
    if (!stats || stats.sampleSize < 10 || stats.estimate === null) return null;

    const [match] = await sql<{ levelId: string; worldId: string }[]>`
      SELECT ll.id AS "levelId", lw.id AS "worldId"
        FROM learning_levels ll
        JOIN learning_worlds lw ON lw.id = ll.world_id
       WHERE ${stats.estimate} BETWEEN ll.difficulty_min AND ll.difficulty_max
       ORDER BY lw.position, ll.position
       LIMIT 1
    `;
    if (match) return match;

    const [globalRange] = await sql<{ maxDifficulty: number; minDifficulty: number }[]>`
      SELECT min(difficulty_min) AS "minDifficulty", max(difficulty_max) AS "maxDifficulty"
        FROM learning_levels
    `;
    if (!globalRange || stats.estimate < globalRange.minDifficulty) return null;

    // Estimate exceeds every level's range (a stronger player than the
    // curriculum's ceiling) - place at the hardest level instead of
    // silently defaulting back to the very first one.
    const [hardest] = await sql<{ levelId: string; worldId: string }[]>`
      SELECT ll.id AS "levelId", lw.id AS "worldId"
        FROM learning_levels ll
        JOIN learning_worlds lw ON lw.id = ll.world_id
       ORDER BY lw.position DESC, ll.position DESC
       LIMIT 1
    `;
    return hardest ?? null;
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
      SELECT rank
        FROM (
          SELECT ll.id,
                 (ROW_NUMBER() OVER (ORDER BY lw.position, ll.position))::int AS rank
            FROM learning_levels ll
            JOIN learning_worlds lw ON lw.id = ll.world_id
        ) ranked_levels
       WHERE id = ${levelId}
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

  async getStageContext(stageId: string): Promise<StageContextRow | null> {
    const sql = this.database.client;
    const [row] = await sql<StageContextRow[]>`
      SELECT ls.id, ls.type, ls.exercise_id AS "exerciseId", ls.lesson_id AS "lessonId",
             ls.level_id AS "levelId", ll.world_id AS "worldId",
             ll.difficulty_min AS "levelDifficultyMin", ll.difficulty_max AS "levelDifficultyMax",
             ll.allowed_themes AS "allowedThemes"
        FROM learning_stages ls
        JOIN learning_levels ll ON ll.id = ls.level_id
       WHERE ls.id = ${stageId}
    `;
    return row ?? null;
  }

  async getOrStartCompletion(userId: string, stageId: string): Promise<CompletionRow> {
    const sql = this.database.client;
    const [row] = await sql<CompletionRow[]>`
      INSERT INTO user_stage_completions (user_id, stage_id, status, started_at)
      VALUES (${userId}, ${stageId}, 'available', now())
      ON CONFLICT (user_id, stage_id) DO UPDATE SET
        started_at = COALESCE(user_stage_completions.started_at, EXCLUDED.started_at)
      RETURNING status, started_at AS "startedAt", resolved_exercise_id AS "resolvedExerciseId",
                training_session_id AS "trainingSessionId", lesson_attempt_id AS "lessonAttemptId",
                correct_first_try AS "correctFirstTry", hints_used AS "hintsUsed"
    `;
    return row!;
  }

  async setResolvedExercise(userId: string, stageId: string, exerciseId: string): Promise<void> {
    const sql = this.database.client;
    await sql`
      UPDATE user_stage_completions
         SET resolved_exercise_id = ${exerciseId}
       WHERE user_id = ${userId} AND stage_id = ${stageId} AND resolved_exercise_id IS NULL
    `;
  }

  async setLessonAttempt(userId: string, stageId: string, lessonAttemptId: string): Promise<void> {
    const sql = this.database.client;
    await sql`
      UPDATE user_stage_completions
         SET lesson_attempt_id = ${lessonAttemptId}
       WHERE user_id = ${userId} AND stage_id = ${stageId} AND lesson_attempt_id IS NULL
    `;
  }

  async setTrainingSession(
    userId: string,
    stageId: string,
    trainingSessionId: string,
  ): Promise<void> {
    const sql = this.database.client;
    await sql`
      UPDATE user_stage_completions
         SET training_session_id = ${trainingSessionId}
       WHERE user_id = ${userId} AND stage_id = ${stageId} AND training_session_id IS NULL
    `;
  }

  /** Weakest canonical skill, optionally restricted by canonical keys or legacy exercise tags. */
  async pickWeakestSkill(userId: string, allowedThemes: string[] | null): Promise<string | null> {
    const sql = this.database.client;
    const [row] = await sql<{ skill: string }[]>`
      SELECT mastery.skill
      FROM skill_mastery mastery
      WHERE mastery.user_id = ${userId}
        AND (
          ${allowedThemes}::text[] IS NULL
          OR mastery.skill = ANY(${allowedThemes})
          OR EXISTS (
            SELECT 1 FROM skill_tag_aliases alias
            WHERE alias.skill_key = mastery.skill AND alias.tag = ANY(${allowedThemes})
          )
        )
      ORDER BY mastery.score ASC, mastery.attempts DESC
      LIMIT 1
    `;
    return row?.skill ?? null;
  }

  /** Picks an unsolved playable exercise, preferring `skill` and the given difficulty band; falls back progressively. */
  async pickReviewExercise(
    userId: string,
    skill: string | null,
    difficultyMin: number,
    difficultyMax: number,
  ): Promise<string | null> {
    const sql = this.database.client;
    // Every branch requires an exercise that's actually playable in the
    // guided single-line board flow this feeds into: a real move sequence
    // (not free_text, which has no move validation at all), at least one
    // hint, and a recorded solution line. Without this, an exercise
    // authored as book prose with no hints/solution could get picked for
    // a review stage and be permanently unsolvable there — the same class
    // of bug fixed for the seed script's initial stage assignment
    // (apps/api/src/database/seed-learning-path.ts).
    if (skill) {
      const [bySkill] = await sql<{ id: string }[]>`
        SELECT e.id FROM exercises e
         WHERE e.status = 'published' AND e.position_type = 'legal_position'
           AND e.difficulty_score IS NOT NULL
           AND (
             ${skill} = ANY(e.tags)
             OR EXISTS (
               SELECT 1 FROM skill_tag_aliases alias
               WHERE alias.skill_key = ${skill} AND alias.tag = ANY(e.tags)
             )
           )
           AND e.difficulty_score BETWEEN ${difficultyMin} AND ${difficultyMax}
           AND COALESCE(e.import_metadata->>'answerFormat', 'move_sequence') = 'move_sequence'
           AND jsonb_array_length(e.hints) > 0
           AND jsonb_array_length(e.solution_lines) > 0
           AND NOT EXISTS (
             SELECT 1 FROM exercise_attempts a
              WHERE a.exercise_id = e.id AND a.user_id = ${userId} AND a.correct = true
           )
         ORDER BY random()
         LIMIT 1
      `;
      if (bySkill) return bySkill.id;
    }
    const [byRange] = await sql<{ id: string }[]>`
      SELECT e.id FROM exercises e
       WHERE e.status = 'published' AND e.position_type = 'legal_position'
         AND e.difficulty_score IS NOT NULL
         AND e.difficulty_score BETWEEN ${difficultyMin} AND ${difficultyMax}
         AND COALESCE(e.import_metadata->>'answerFormat', 'move_sequence') = 'move_sequence'
         AND jsonb_array_length(e.hints) > 0
         AND jsonb_array_length(e.solution_lines) > 0
         AND NOT EXISTS (
           SELECT 1 FROM exercise_attempts a
            WHERE a.exercise_id = e.id AND a.user_id = ${userId} AND a.correct = true
         )
       ORDER BY random()
       LIMIT 1
    `;
    if (byRange) return byRange.id;

    // Last resort: pool exhausted (user solved everything in range) — allow a repeat.
    const [any] = await sql<{ id: string }[]>`
      SELECT e.id FROM exercises e
       WHERE e.status = 'published' AND e.position_type = 'legal_position'
         AND e.difficulty_score IS NOT NULL
         AND e.difficulty_score BETWEEN ${difficultyMin} AND ${difficultyMax}
         AND COALESCE(e.import_metadata->>'answerFormat', 'move_sequence') = 'move_sequence'
         AND jsonb_array_length(e.hints) > 0
         AND jsonb_array_length(e.solution_lines) > 0
       ORDER BY random()
       LIMIT 1
    `;
    return any?.id ?? null;
  }

  async countAttemptsSince(
    userId: string,
    exerciseId: string,
    since: string,
  ): Promise<{ failures: number; successes: number }> {
    const sql = this.database.client;
    const [row] = await sql<{ failures: number; successes: number }[]>`
      SELECT count(*) FILTER (WHERE correct)::int AS successes,
             count(*) FILTER (WHERE NOT correct)::int AS failures
        FROM exercise_attempts
       WHERE user_id = ${userId} AND exercise_id = ${exerciseId} AND attempted_at >= ${since}
    `;
    return row ?? { failures: 0, successes: 0 };
  }

  async markStageCompleted(
    userId: string,
    stageId: string,
    input: { correctFirstTry: boolean; hintsUsed: number },
  ): Promise<void> {
    const sql = this.database.client;
    await sql`
      UPDATE user_stage_completions
         SET status = 'completed', completed_at = now(),
             correct_first_try = ${input.correctFirstTry}, hints_used = ${input.hintsUsed},
             attempts = attempts + 1, updated_at = now()
       WHERE user_id = ${userId} AND stage_id = ${stageId}
    `;
  }

  async isLevelFullyCompleted(userId: string, levelId: string): Promise<boolean> {
    const sql = this.database.client;
    const [row] = await sql<{ allDone: boolean }[]>`
      SELECT count(*) = count(*) FILTER (WHERE usc.status = 'completed') AS "allDone"
        FROM learning_stages ls
        LEFT JOIN user_stage_completions usc ON usc.stage_id = ls.id AND usc.user_id = ${userId}
       WHERE ls.level_id = ${levelId}
    `;
    return row?.allDone ?? false;
  }

  /** Advances highest_unlocked_level_id to the next level in curriculum order, only if `fromLevelId` is still the current frontier. */
  async advanceProgressPastLevel(userId: string, fromLevelId: string): Promise<void> {
    const sql = this.database.client;
    await sql`
      WITH ranked AS (
        SELECT ll.id, (ROW_NUMBER() OVER (ORDER BY lw.position, ll.position))::int AS rank
          FROM learning_levels ll JOIN learning_worlds lw ON lw.id = ll.world_id
      ),
      next_level AS (
        SELECT r2.id
          FROM ranked r1
          JOIN ranked r2 ON r2.rank = r1.rank + 1
         WHERE r1.id = ${fromLevelId}
      )
      UPDATE user_learning_progress p
         SET highest_unlocked_level_id = COALESCE(
               (SELECT id FROM next_level), p.highest_unlocked_level_id
             ),
             current_level_id = COALESCE((SELECT id FROM next_level), p.current_level_id),
             updated_at = now()
       WHERE p.user_id = ${userId} AND p.highest_unlocked_level_id = ${fromLevelId}
    `;
  }

  async upsertSkillMastery(
    userId: string,
    skills: string[],
    successes: number,
    failures: number,
  ): Promise<void> {
    if (skills.length === 0 || successes + failures === 0) return;
    const sql = this.database.client;
    for (const skill of skills) {
      await sql`
        INSERT INTO skill_mastery (user_id, skill, attempts, success_count, error_count, score, last_seen_at)
        VALUES (
          ${userId}, ${skill}, ${successes + failures}, ${successes}, ${failures},
          ${Math.round((successes / (successes + failures)) * 100)}, now()
        )
        ON CONFLICT (user_id, skill) DO UPDATE SET
          attempts = skill_mastery.attempts + EXCLUDED.attempts,
          success_count = skill_mastery.success_count + EXCLUDED.success_count,
          error_count = skill_mastery.error_count + EXCLUDED.error_count,
          score = ROUND(
            (skill_mastery.success_count + EXCLUDED.success_count)::numeric
              / (skill_mastery.attempts + EXCLUDED.attempts) * 100
          ),
          last_seen_at = now(),
          updated_at = now()
      `;
    }
  }

  async isCapstoneLevel(levelId: string): Promise<boolean> {
    const sql = this.database.client;
    const [row] = await sql<{ isCapstone: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM learning_stages WHERE level_id = ${levelId} AND type IN ('checkpoint', 'boss')
      ) AS "isCapstone"
    `;
    return row?.isCapstone ?? false;
  }

  async getExerciseTags(exerciseId: string): Promise<string[]> {
    const sql = this.database.client;
    const rows = await sql<{ skill: string }[]>`
      SELECT DISTINCT COALESCE(alias.skill_key, tag.value) AS skill
      FROM exercises exercise
      CROSS JOIN LATERAL unnest(exercise.tags) AS tag(value)
      LEFT JOIN skill_tag_aliases alias ON alias.tag = tag.value
      WHERE exercise.id = ${exerciseId}
        AND tag.value NOT IN ('challenge', 'lichess', 'classico')
    `;
    return rows.map((row) => row.skill);
  }

  async addXp(userId: string, amount: number): Promise<void> {
    const sql = this.database.client;
    await sql`
      UPDATE user_learning_progress SET xp = xp + ${amount}, updated_at = now()
       WHERE user_id = ${userId}
    `;
  }

  /** Bumps the daily activity streak (UTC calendar day) and returns the new value. */
  async bumpStreak(userId: string): Promise<number> {
    const sql = this.database.client;
    const [row] = await sql<{ streakDays: number }[]>`
      UPDATE user_learning_progress
         SET streak_days = CASE
               WHEN last_activity_date = current_date THEN streak_days
               WHEN last_activity_date = current_date - 1 THEN streak_days + 1
               ELSE 1
             END,
             last_activity_date = current_date,
             updated_at = now()
       WHERE user_id = ${userId}
       RETURNING streak_days AS "streakDays"
    `;
    return row?.streakDays ?? 0;
  }

  async countCompletedStages(userId: string): Promise<number> {
    const sql = this.database.client;
    const [row] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM user_stage_completions
       WHERE user_id = ${userId} AND status = 'completed'
    `;
    return row?.count ?? 0;
  }

  /** True when every completed stage in this level was solved on the first try. */
  async isLevelPerfectFirstTry(userId: string, levelId: string): Promise<boolean> {
    const sql = this.database.client;
    const [row] = await sql<{ allPerfect: boolean }[]>`
      SELECT bool_and(usc.correct_first_try IS TRUE) AS "allPerfect"
        FROM learning_stages ls
        JOIN user_stage_completions usc
          ON usc.stage_id = ls.id AND usc.user_id = ${userId} AND usc.status = 'completed'
       WHERE ls.level_id = ${levelId}
    `;
    return row?.allPerfect ?? false;
  }

  async getWorldTitle(worldId: string): Promise<string | null> {
    const sql = this.database.client;
    const [row] = await sql<{ title: string }[]>`
      SELECT title FROM learning_worlds WHERE id = ${worldId}
    `;
    return row?.title ?? null;
  }

  /** Idempotent: returns true only when this call newly granted the badge. */
  async awardBadge(userId: string, badgeKey: string, label: string): Promise<boolean> {
    const sql = this.database.client;
    const result = await sql`
      INSERT INTO user_learning_badges (user_id, badge_key, label)
      VALUES (${userId}, ${badgeKey}, ${label})
      ON CONFLICT (user_id, badge_key) DO NOTHING
    `;
    return result.count > 0;
  }

  async listBadges(userId: string): Promise<BadgeRow[]> {
    const sql = this.database.client;
    return sql<BadgeRow[]>`
      SELECT badge_key AS "badgeKey", label, earned_at AS "earnedAt"
        FROM user_learning_badges
       WHERE user_id = ${userId}
       ORDER BY earned_at DESC
    `;
  }
}

export interface BadgeRow {
  badgeKey: string;
  earnedAt: string;
  label: string;
}

export interface StageContextRow {
  allowedThemes: string[] | null;
  exerciseId: string | null;
  id: string;
  lessonId: string | null;
  levelDifficultyMax: number;
  levelDifficultyMin: number;
  levelId: string;
  type: 'challenge' | 'lesson' | 'review' | 'checkpoint' | 'boss';
  worldId: string;
}

export interface CompletionRow {
  correctFirstTry: boolean | null;
  hintsUsed: number;
  lessonAttemptId: string | null;
  resolvedExerciseId: string | null;
  startedAt: string;
  status: 'locked' | 'available' | 'completed';
  trainingSessionId: string | null;
}
