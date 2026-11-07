import type { GameStudyPlan } from '@xadrez/contracts';
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';
import { pickThemes, THEME_CATALOG, type MoveStat, type ThemeKey } from './study-themes.js';

const EXERCISES_PER_PLAN = 5;
const LIBRARY_GAMES_PER_PLAN = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ExerciseRow {
  difficulty: string | null;
  id: string;
  title: string | null;
}

@Injectable()
export class StudyPlanRepository {
  constructor(private readonly database: DatabaseService) {}

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

  /** Unsolved published board exercises for the tags (any tag when empty), shuffled. */
  private async exercisesFor(
    userId: string,
    tags: readonly string[],
    limit: number,
    skip: string[],
  ): Promise<ExerciseRow[]> {
    return this.database.client<ExerciseRow[]>`
      SELECT e.id, e.title, e.difficulty
        FROM exercises e
       WHERE e.status = 'published'
         AND e.fen IS NOT NULL
         AND (${tags.length === 0} OR e.tags && ${[...tags]}::text[])
         AND e.id <> ALL(${skip}::uuid[])
         AND NOT EXISTS (
           SELECT 1 FROM exercise_attempts a
            WHERE a.exercise_id = e.id AND a.user_id = ${userId} AND a.correct
         )
       ORDER BY random()
       LIMIT ${limit}
    `;
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

  async build(gameId: string, userId: string, color: 'black' | 'white'): Promise<GameStudyPlan> {
    const themes = pickThemes(await this.moveStats(gameId), color);
    const themeKey = (index: number) => themes[index % themes.length]!.key as ThemeKey;

    const exercises: GameStudyPlan['exercises'] = [];
    const taken: string[] = [];
    const add = (row: ExerciseRow, label: string) => {
      taken.push(row.id);
      exercises.push({
        difficulty: row.difficulty,
        id: row.id,
        theme: label,
        title: row.title ?? `Exercício de ${label.toLowerCase()}`,
      });
    };
    for (let i = 0; exercises.length < EXERCISES_PER_PLAN && i < EXERCISES_PER_PLAN * 2; i += 1) {
      const theme = themes[i % themes.length]!;
      const [row] = await this.exercisesFor(userId, THEME_CATALOG[themeKey(i)].tags, 1, taken);
      if (row) add(row, theme.label);
    }
    // Themes without tagged exercises still get practice: fill with any unsolved board exercise.
    if (exercises.length < EXERCISES_PER_PLAN) {
      const rows = await this.exercisesFor(
        userId,
        [],
        EXERCISES_PER_PLAN - exercises.length,
        taken,
      );
      for (const row of rows) add(row, themes[0]!.label);
    }

    const libraryGames: GameStudyPlan['libraryGames'] = [];
    const seen: string[] = [];
    for (
      let i = 0;
      libraryGames.length < LIBRARY_GAMES_PER_PLAN && i < LIBRARY_GAMES_PER_PLAN * 2;
      i += 1
    ) {
      const key = themeKey(i);
      const game = await this.libraryFor(key, seen);
      if (!game) continue;
      seen.push(game.id);
      const place = [game.event, game.played_year].filter(Boolean).join(', ');
      libraryGames.push({
        focus: THEME_CATALOG[key].focus,
        id: game.id,
        title: `${game.white} x ${game.black}${place ? ` (${place})` : ''}`,
      });
    }
    return { exercises, libraryGames, themes };
  }
}
