import type { GameStudyPlan } from '@xadrez/contracts';
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';
import {
  matchTags,
  pickThemes,
  THEME_CATALOG,
  type MoveStat,
  type ThemeKey,
} from './study-themes.js';

const EXERCISES_PER_PLAN = 5;
const LIBRARY_GAMES_PER_PLAN = 3;
const TAGS_CACHE_MS = 10 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StudyKind = 'exercise' | 'game';

interface ExerciseRow {
  difficulty: string | null;
  id: string;
  title: string | null;
}

@Injectable()
export class StudyPlanRepository {
  private tagsCache: { at: number; tags: string[] } | null = null;

  constructor(private readonly database: DatabaseService) {}

  /** Tags of the published board exercises, most used first (cached for a few minutes). */
  async availableTags(): Promise<string[]> {
    if (this.tagsCache && Date.now() - this.tagsCache.at < TAGS_CACHE_MS) {
      return this.tagsCache.tags;
    }
    const rows = await this.database.client<Array<{ tag: string }>>`
      SELECT t.tag
        FROM exercises e, unnest(e.tags) AS t(tag)
       WHERE e.status = 'published' AND e.fen IS NOT NULL
       GROUP BY t.tag
       ORDER BY count(*) DESC, t.tag
    `;
    this.tagsCache = { at: Date.now(), tags: rows.map((row) => row.tag) };
    return this.tagsCache.tags;
  }

  /** The player's colour in the game, or null when the user did not play it. */
  async playerColor(gameId: string, userId: string): Promise<'black' | 'white' | null> {
    if (!UUID.test(gameId)) return null;
    const [row] = await this.database.client<Array<{ color: 'black' | 'white' }>>`
      SELECT color FROM game_players WHERE game_id = ${gameId} AND user_id = ${userId}
    `;
    return row?.color ?? null;
  }

  async moveStats(gameId: string): Promise<MoveStat[]> {
    const rows = await this.database.client<
      Array<{
        color: 'black' | 'white';
        missedWin: boolean;
        ply: number | string;
        quality: MoveStat['quality'];
      }>
    >`
      SELECT gm.color, gma.ply, gma.quality, gma.missed_win AS "missedWin"
        FROM game_move_analyses gma
        JOIN game_moves gm ON gm.game_id = gma.game_id AND gm.ply = gma.ply
       WHERE gma.game_id = ${gameId}
    `;
    return rows.map((row) => ({ ...row, ply: Number(row.ply) }));
  }

  /** One unsolved published board exercise that carries one of the tags. */
  private async exerciseFor(
    userId: string,
    tags: readonly string[],
    skip: string[],
  ): Promise<ExerciseRow | null> {
    if (tags.length === 0) return null;
    const [row] = await this.database.client<ExerciseRow[]>`
      SELECT e.id, e.title, e.difficulty
        FROM exercises e
       WHERE e.status = 'published'
         AND e.fen IS NOT NULL
         AND e.tags && ${[...tags]}::text[]
         AND e.id <> ALL(${skip}::uuid[])
         AND NOT EXISTS (
           SELECT 1 FROM exercise_attempts a
            WHERE a.exercise_id = e.id AND a.user_id = ${userId} AND a.correct
         )
       ORDER BY random()
       LIMIT 1
    `;
    return row ?? null;
  }

  private async libraryFor(theme: ThemeKey, skip: string[]) {
    const { maxPly, minPly } = THEME_CATALOG[theme].library;
    const pick = (famousOnly: boolean) =>
      this.database.client<
        Array<{
          black: string;
          event: string | null;
          id: string;
          played_year: number | null;
          white: string;
        }>
      >`
        SELECT id, white, black, event, played_year
          FROM library_games
         WHERE ply_count BETWEEN ${minPly} AND ${maxPly}
           AND result <> '1/2-1/2'
           AND id <> ALL(${skip}::uuid[])
           AND (${!famousOnly} OR coalesce(white_elo, 0) + coalesce(black_elo, 0) >= 5200)
         ORDER BY random()
         LIMIT 1
      `;
    const [famous] = await pick(true);
    if (famous) return famous;
    const [any] = await pick(false);
    return any ?? null;
  }

  /** Builds a fresh plan. Exercises come only from themes that have registered exercises. */
  private async build(
    gameId: string,
    userId: string,
    color: 'black' | 'white',
  ): Promise<GameStudyPlan> {
    const available = await this.availableTags();
    const tagsOf = (key: string) => matchTags(THEME_CATALOG[key as ThemeKey].tags, available);
    const themes = pickThemes(await this.moveStats(gameId), color).map((theme) => ({
      ...theme,
      hasExercises: tagsOf(theme.key).length > 0,
    }));

    const exercises: GameStudyPlan['exercises'] = [];
    const taken: string[] = [];
    const trainable = themes.filter((theme) => theme.hasExercises);
    for (
      let i = 0;
      trainable.length > 0 && exercises.length < EXERCISES_PER_PLAN && i < EXERCISES_PER_PLAN * 2;
      i += 1
    ) {
      const theme = trainable[i % trainable.length]!;
      const row = await this.exerciseFor(userId, tagsOf(theme.key), taken);
      if (!row) continue;
      taken.push(row.id);
      exercises.push({
        difficulty: row.difficulty,
        done: false,
        id: row.id,
        theme: theme.label,
        title: row.title ?? `Exercício de ${theme.label.toLowerCase()}`,
      });
    }

    const libraryGames: GameStudyPlan['libraryGames'] = [];
    const seen: string[] = [];
    for (
      let i = 0;
      libraryGames.length < LIBRARY_GAMES_PER_PLAN && i < LIBRARY_GAMES_PER_PLAN * 2;
      i += 1
    ) {
      const key = themes[i % themes.length]!.key as ThemeKey;
      const game = await this.libraryFor(key, seen);
      if (!game) continue;
      seen.push(game.id);
      const place = [game.event, game.played_year].filter(Boolean).join(', ');
      libraryGames.push({
        done: false,
        focus: THEME_CATALOG[key].focus,
        id: game.id,
        title: `${game.white} x ${game.black}${place ? ` (${place})` : ''}`,
      });
    }
    return { exercises, libraryGames, themes };
  }

  /** The stored plan of this game and player; created once, so every device sees the same one. */
  async getOrCreate(
    gameId: string,
    userId: string,
    color: 'black' | 'white',
  ): Promise<GameStudyPlan> {
    const sql = this.database.client;
    const read = async () => {
      const [row] = await sql<Array<{ plan: GameStudyPlan }>>`
        SELECT plan FROM game_study_plans WHERE game_id = ${gameId} AND user_id = ${userId}
      `;
      return row?.plan ?? null;
    };
    let plan = await read();
    if (!plan) {
      const built = await this.build(gameId, userId, color);
      await sql`
        INSERT INTO game_study_plans (game_id, user_id, plan)
        VALUES (${gameId}, ${userId}, ${sql.json(built as never)})
        ON CONFLICT (game_id, user_id) DO NOTHING
      `;
      plan = (await read()) ?? built;
    }
    const done = await this.doneIds(userId);
    return {
      ...plan,
      exercises: plan.exercises.map((item) => ({ ...item, done: done.exercise.has(item.id) })),
      libraryGames: plan.libraryGames.map((item) => ({ ...item, done: done.game.has(item.id) })),
    };
  }

  private async doneIds(userId: string) {
    const rows = await this.database.client<Array<{ item_id: string; kind: StudyKind }>>`
      SELECT kind, item_id FROM study_progress WHERE user_id = ${userId}
    `;
    return {
      exercise: new Set(rows.filter((row) => row.kind === 'exercise').map((row) => row.item_id)),
      game: new Set(rows.filter((row) => row.kind === 'game').map((row) => row.item_id)),
    };
  }

  /** Idempotent: marks an exercise as solved or a library game as watched for this player. */
  async markDone(userId: string, kind: StudyKind, itemId: string): Promise<void> {
    await this.database.client`
      INSERT INTO study_progress (user_id, kind, item_id) VALUES (${userId}, ${kind}, ${itemId})
      ON CONFLICT DO NOTHING
    `;
  }
}
