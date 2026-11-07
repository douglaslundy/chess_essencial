import type { LibraryReviewEntry, LibrarySearchQuery } from '@xadrez/contracts';
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';
import { LEGENDARY_GAMES } from './legendary-games.js';

export interface LibraryGameRow {
  black: string;
  black_elo: number | null;
  eco: string | null;
  event: string | null;
  id: string;
  moves_san: string;
  opening_family: string | null;
  opening_name: string | null;
  played_on: string | null;
  ply_count: number;
  result: '1-0' | '0-1' | '1/2-1/2';
  round: string | null;
  site: string | null;
  white: string;
  white_elo: number | null;
}

export interface LibraryReviewRow {
  entries: LibraryReviewEntry[];
  status: 'generating' | 'completed' | 'failed';
}

/** Name prefixes (lowercase) of classical world champions as they appear in the imported PGNs. */
export const WORLD_CHAMPION_PREFIXES = [
  'botvinnik',
  'smyslov',
  'tal,',
  'petrosian',
  'spassky',
  'fischer',
  'karpov',
  'kasparov',
  'kramnik',
  'anand',
  'topalov',
  'carlsen',
  'ding liren',
  'gukesh',
];
// Title matches, Candidates and the final stage of tournaments ("World Blitz Final", "GCT Finals").
const FINALS_EVENT_PATTERN = '(world championship|wch|candidates|\\mfinals?\\M)';

const likePattern = (value: string) => `%${value.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`;

@Injectable()
export class LibraryRepository {
  constructor(private readonly database: DatabaseService) {}

  async search(query: LibrarySearchQuery) {
    const sql = this.database.client;
    const conditions = [sql`TRUE`];
    if (query.player) {
      const p = likePattern(query.player);
      conditions.push(sql`(lower(white) LIKE ${p} OR lower(black) LIKE ${p})`);
    }
    if (query.opening) conditions.push(sql`opening_family = ${query.opening}`);
    if (query.eco) conditions.push(sql`eco LIKE ${`${query.eco.toUpperCase()}%`}`);
    if (query.result) conditions.push(sql`result = ${query.result}`);
    if (query.yearFrom) conditions.push(sql`played_year >= ${query.yearFrom}`);
    if (query.yearTo) conditions.push(sql`played_year <= ${query.yearTo}`);
    if (query.collection === 'famous') {
      const champion = (column: 'white' | 'black') =>
        sql`EXISTS (SELECT 1 FROM unnest(${WORLD_CHAMPION_PREFIXES}::text[]) AS p WHERE lower(${sql(column)}) LIKE p || '%')`;
      conditions.push(sql`${champion('white')} AND ${champion('black')}`);
    }
    if (query.collection === 'finals') {
      conditions.push(sql`coalesce(event, '') ~* ${FINALS_EVENT_PATTERN}`);
    }
    if (query.collection === 'legendary') {
      const picks = LEGENDARY_GAMES.map(
        (game) =>
          sql`(lower(white) LIKE ${`${game.white}%`} AND lower(black) LIKE ${`${game.black}%`} AND played_year = ${game.year} AND round = ${game.round})`,
      );
      conditions.push(sql`(${picks.reduce((acc, part) => sql`${acc} OR ${part}`)})`);
    }
    if (query.q) {
      const p = likePattern(query.q);
      conditions.push(
        sql`(lower(white) LIKE ${p} OR lower(black) LIKE ${p} OR lower(coalesce(event, '')) LIKE ${p} OR lower(coalesce(opening_name, '')) LIKE ${p})`,
      );
    }
    const where = conditions.reduce((acc, part) => sql`${acc} AND ${part}`);
    const [count] = await sql<{ total: number }[]>`
      SELECT count(*)::int AS total FROM library_games WHERE ${where}
    `;
    const rows = await sql<LibraryGameRow[]>`
      SELECT id, white, black, white_elo, black_elo, event, played_on, result, eco,
        opening_name, opening_family, ply_count
      FROM library_games WHERE ${where}
      ORDER BY coalesce(played_year, 0) DESC, id
      LIMIT ${query.limit} OFFSET ${query.offset}
    `;
    return { rows, total: count?.total ?? 0 };
  }

  async facets() {
    const sql = this.database.client;
    const openings = await sql<{ count: number; name: string }[]>`
      SELECT opening_family AS name, count(*)::int AS count FROM library_games
      WHERE opening_family IS NOT NULL GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 120
    `;
    const players = await sql<{ count: number; name: string }[]>`
      SELECT name, count(*)::int AS count FROM (
        SELECT white AS name FROM library_games UNION ALL SELECT black FROM library_games
      ) t GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 200
    `;
    return { openings, players };
  }

  /** What the "share this game" check needs: the player's seat, the moves and their analysis. */
  async sharableGame(gameId: string, userId: string) {
    const sql = this.database.client;
    const [game] = await sql<
      Array<{
        black: string;
        finishedAt: Date | null;
        playerColor: 'black' | 'white';
        result: string;
        white: string;
      }>
    >`
      SELECT g.finished_at AS "finishedAt", g.result::text AS result, mine.color AS "playerColor",
        COALESCE(white_profile.display_name, 'Brancas') AS white,
        COALESCE(black_profile.display_name, 'Pretas') AS black
      FROM games g
      JOIN game_players mine ON mine.game_id = g.id AND mine.user_id = ${userId}
      JOIN game_players white ON white.game_id = g.id AND white.color = 'white'
      JOIN game_players black ON black.game_id = g.id AND black.color = 'black'
      LEFT JOIN user_profiles white_profile ON white_profile.user_id = white.user_id
      LEFT JOIN user_profiles black_profile ON black_profile.user_id = black.user_id
      WHERE g.id = ${gameId} AND g.status = 'finished' AND g.coach_mode = false
    `;
    if (!game) return null;
    const moves = await sql<Array<{ san: string }>>`
      SELECT san FROM game_moves WHERE game_id = ${gameId} ORDER BY ply
    `;
    const analysis = await sql<Array<{ centipawnLoss: number; color: string; quality: string }>>`
      SELECT gma.centipawn_loss AS "centipawnLoss", gma.color::text AS color,
        gma.quality::text AS quality
      FROM game_move_analyses gma
      JOIN game_analyses ga ON ga.game_id = gma.game_id AND ga.status = 'completed'
      WHERE gma.game_id = ${gameId}
    `;
    return { ...game, analysis, moves: moves.map((move) => move.san) };
  }

  /** Idempotent: the same move list is stored once (external_key is its hash). */
  async addCommunityGame(input: {
    black: string;
    key: string;
    movesSan: string[];
    result: string;
    white: string;
  }) {
    const sql = this.database.client;
    const [row] = await sql<Array<{ id: string }>>`
      INSERT INTO library_games (
        external_key, white, black, event, site, played_on, played_year, result,
        moves_san, ply_count
      ) VALUES (
        ${input.key}, ${input.white}, ${input.black}, 'Partida da comunidade', 'Xadrez Essencial',
        to_char(now(), 'YYYY.MM.DD'), extract(year FROM now())::integer, ${input.result},
        ${input.movesSan.join(' ')}, ${input.movesSan.length}
      )
      ON CONFLICT (external_key) DO UPDATE SET external_key = library_games.external_key
      RETURNING id
    `;
    return row!.id;
  }

  async getGame(id: string) {
    const [row] = await this.database.client<LibraryGameRow[]>`
      SELECT id, white, black, white_elo, black_elo, event, played_on, result, eco,
        opening_name, opening_family, ply_count, round, site, moves_san
      FROM library_games WHERE id = ${id}
    `;
    return row ?? null;
  }

  async getReview(gameId: string) {
    const [row] = await this.database.client<LibraryReviewRow[]>`
      SELECT status, entries FROM library_game_reviews WHERE game_id = ${gameId}
    `;
    return row ?? null;
  }

  /** Atomic claim: true only if this caller must (re)start generation. */
  async claimReview(gameId: string) {
    const rows = await this.database.client`
      INSERT INTO library_game_reviews (game_id, status) VALUES (${gameId}, 'generating')
      ON CONFLICT (game_id) DO UPDATE SET status = 'generating', error = NULL, updated_at = now()
      WHERE library_game_reviews.status = 'failed'
        OR (library_game_reviews.status = 'generating'
            AND library_game_reviews.updated_at < now() - interval '5 minutes')
      RETURNING game_id
    `;
    return rows.length > 0;
  }

  async saveProgress(
    gameId: string,
    entries: LibraryReviewEntry[],
    status: 'generating' | 'completed' | 'failed',
    meta: { error?: string; model?: string; provider?: string } = {},
  ) {
    await this.database.client`
      UPDATE library_game_reviews SET
        entries = ${this.database.client.json(entries as never)},
        status = ${status},
        provider = coalesce(${meta.provider ?? null}, provider),
        model = coalesce(${meta.model ?? null}, model),
        error = ${meta.error ?? null},
        updated_at = now()
      WHERE game_id = ${gameId}
    `;
  }
}
