import type { PlayerMetrics } from '@xadrez/contracts';
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';
import { buildInsights, type InsightInput } from './player-insights.js';

/** The quality figures cover the player's most recent analysed games. */
const ANALYSED_GAMES_WINDOW = 30;

const phaseOf = (ply: number): keyof InsightInput['badByPhase'] =>
  ply <= 20 ? 'opening' : ply <= 60 ? 'middlegame' : 'endgame';

@Injectable()
export class PlayerMetricsRepository {
  constructor(private readonly database: DatabaseService) {}

  async forUser(userId: string): Promise<PlayerMetrics> {
    const sql = this.database.client;
    const [totals] = await sql<
      Array<{
        draws: number;
        games: number;
        losses: number;
        lossesOnTime: number;
        seconds: string | null;
        wins: number;
      }>
    >`
      SELECT count(*)::int AS games,
             count(*) FILTER (WHERE (gp.color = 'white' AND g.result = 'white_win')
                                 OR (gp.color = 'black' AND g.result = 'black_win'))::int AS wins,
             count(*) FILTER (WHERE g.result = 'draw')::int AS draws,
             count(*) FILTER (WHERE (gp.color = 'white' AND g.result = 'black_win')
                                 OR (gp.color = 'black' AND g.result = 'white_win'))::int AS losses,
             count(*) FILTER (WHERE g.termination = 'timeout'
                                AND ((gp.color = 'white' AND g.result = 'black_win')
                                  OR (gp.color = 'black' AND g.result = 'white_win')))::int AS "lossesOnTime",
             sum(extract(epoch FROM (g.finished_at - g.started_at)))
               FILTER (WHERE g.started_at IS NOT NULL AND g.finished_at IS NOT NULL) AS seconds
        FROM game_players gp
        JOIN games g ON g.id = gp.game_id
       WHERE gp.user_id = ${userId} AND g.status = 'finished'
    `;

    const moves = await sql<
      Array<{ gameId: string; missedWin: boolean; ply: number | string; quality: string }>
    >`
      WITH recent AS (
        SELECT gp.game_id, gp.color
          FROM game_players gp
          JOIN games g ON g.id = gp.game_id
         WHERE gp.user_id = ${userId} AND g.status = 'finished'
           AND EXISTS (SELECT 1 FROM game_move_analyses a WHERE a.game_id = g.id)
         ORDER BY g.finished_at DESC NULLS LAST
         LIMIT ${ANALYSED_GAMES_WINDOW}
      )
      SELECT r.game_id AS "gameId", gma.ply, gma.quality, gma.missed_win AS "missedWin"
        FROM recent r
        JOIN game_move_analyses gma ON gma.game_id = r.game_id
        JOIN game_moves gm ON gm.game_id = gma.game_id AND gm.ply = gma.ply AND gm.color = r.color
    `;

    const quality: PlayerMetrics['quality'] = {
      bom: 0,
      erro: 0,
      excelente: 0,
      gafe: 0,
      imprecisao: 0,
      missedWin: 0,
      otimo: 0,
    };
    const badByPhase = { endgame: 0, middlegame: 0, opening: 0 };
    for (const move of moves) {
      if (move.quality in quality) quality[move.quality as keyof typeof quality] += 1;
      if (move.missedWin) quality.missedWin += 1;
      if (['imprecisao', 'erro', 'gafe'].includes(move.quality)) {
        badByPhase[phaseOf(Number(move.ply))] += 1;
      }
    }

    const input: InsightInput = {
      analyzedGames: new Set(moves.map((move) => move.gameId)).size,
      badByPhase,
      draws: totals?.draws ?? 0,
      gamesPlayed: totals?.games ?? 0,
      losses: totals?.losses ?? 0,
      lossesOnTime: totals?.lossesOnTime ?? 0,
      quality,
      wins: totals?.wins ?? 0,
    };
    return {
      analyzedGames: input.analyzedGames,
      draws: input.draws,
      gamesPlayed: input.gamesPlayed,
      losses: input.losses,
      quality,
      timePlayedSeconds: Math.round(Number(totals?.seconds ?? 0)),
      wins: input.wins,
      ...buildInsights(input),
    };
  }
}
