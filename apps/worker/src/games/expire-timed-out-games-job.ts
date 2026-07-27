import { ChessJsRules } from '@xadrez/chess-domain';
import { createHash } from 'node:crypto';
import type { Sql } from 'postgres';

// Mirrors apps/api/src/games/domain/game-clock.ts#effectiveClockMs — kept as
// a tiny local copy (not a shared package import, since apps/worker never
// imports from apps/api's src) rather than duplicating anything non-trivial.
function effectiveClockMs(
  storedClockMs: number,
  activeClockStartedAt: Date,
  now: Date,
  delayMs: number,
) {
  const elapsedMs = Math.max(0, now.getTime() - activeClockStartedAt.getTime());
  return Math.max(0, storedClockMs - Math.max(0, elapsedMs - delayMs));
}

interface ActiveGameRow {
  activeClockStartedAt: Date;
  blackClockMs: number;
  delayMs: number;
  id: string;
  sideToMove: 'white' | 'black';
  whiteClockMs: number;
}

/**
 * Backstop for apps/api/src/games/presentation/games.gateway.ts's
 * `scheduleTimeout`: that timer lives only in the gateway process's memory
 * and is re-armed only on `game.join`/`move.submit`/bot reply, so an active
 * game whose clock runs out with nobody reconnecting afterward (or after an
 * API redeploy wipes the in-memory timer) would otherwise stay `active`
 * forever. This job independently re-checks every active game's clock on a
 * short poll and finalizes any that are actually expired — the server (not
 * a socket or a browser tab) is the source of truth for the clock.
 *
 * Mirrors GamesRepository#expireOnTime (apps/api) field-for-field so the two
 * paths produce identical results; both take the same
 * `pg_advisory_xact_lock` + `WHERE status = 'active'` guard, so whichever
 * one reaches a given game first wins and the other becomes a safe no-op.
 */
export async function runExpireTimedOutGamesJob(
  sql: Sql,
  now: Date = new Date(),
): Promise<{ expiredGameIds: string[] }> {
  const candidates = await sql<ActiveGameRow[]>`
    SELECT
      games.id,
      games.side_to_move AS "sideToMove",
      games.white_clock_ms::integer AS "whiteClockMs",
      games.black_clock_ms::integer AS "blackClockMs",
      games.active_clock_started_at AS "activeClockStartedAt",
      game_time_controls.delay_ms AS "delayMs"
    FROM games
    JOIN game_time_controls ON game_time_controls.id = games.time_control_id
    WHERE games.status = 'active' AND games.active_clock_started_at IS NOT NULL
  `;

  const expiredGameIds: string[] = [];
  for (const game of candidates) {
    const storedClockMs = game.sideToMove === 'white' ? game.whiteClockMs : game.blackClockMs;
    const remainingMs = effectiveClockMs(
      storedClockMs,
      new Date(game.activeClockStartedAt),
      now,
      game.delayMs ?? 0,
    );
    if (remainingMs > 0) continue;
    // Games run one at a time and strictly in series (shared VPS, same
    // discipline as the analysis/narration jobs) — this loop is expected to
    // rarely have more than one candidate on any given tick.
    if (await expireGame(sql, game.id)) expiredGameIds.push(game.id);
  }
  return { expiredGameIds };
}

async function expireGame(sql: Sql, gameId: string): Promise<boolean> {
  return sql.begin(async (transaction) => {
    await transaction`SELECT pg_advisory_xact_lock(hashtextextended(${gameId}, 0))`;
    const [game] = await transaction<
      {
        activeClockStartedAt: Date | null;
        blackClockMs: number;
        delayMs: number;
        initialFen: string;
        sideToMove: 'white' | 'black';
        status: string;
        whiteClockMs: number;
      }[]
    >`
      SELECT
        games.status,
        games.initial_fen AS "initialFen",
        games.side_to_move AS "sideToMove",
        games.white_clock_ms::integer AS "whiteClockMs",
        games.black_clock_ms::integer AS "blackClockMs",
        games.active_clock_started_at AS "activeClockStartedAt",
        game_time_controls.delay_ms AS "delayMs"
      FROM games
      JOIN game_time_controls ON game_time_controls.id = games.time_control_id
      WHERE games.id = ${gameId}
    `;
    if (!game || game.status !== 'active' || !game.activeClockStartedAt) return false;

    const [databaseClock] = await transaction<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    if (!databaseClock) return false;
    const receivedAt = new Date(databaseClock.now);
    const storedClockMs = game.sideToMove === 'white' ? game.whiteClockMs : game.blackClockMs;
    const remainingMs = effectiveClockMs(
      storedClockMs,
      new Date(game.activeClockStartedAt),
      receivedAt,
      game.delayMs ?? 0,
    );
    if (remainingMs > 0) return false;

    const history = await transaction<{ uci: string }[]>`
      SELECT uci FROM game_moves WHERE game_id = ${gameId} ORDER BY ply
    `;
    const rules = new ChessJsRules(
      game.initialFen,
      history.map((move) => move.uci),
    );
    const winner = game.sideToMove === 'white' ? 'black' : 'white';
    const result = rules.canWinOnTime(winner)
      ? winner === 'white'
        ? 'white_win'
        : 'black_win'
      : 'draw';

    await transaction`
      UPDATE games
      SET
        white_clock_ms = ${game.sideToMove === 'white' ? 0 : game.whiteClockMs},
        black_clock_ms = ${game.sideToMove === 'black' ? 0 : game.blackClockMs},
        active_clock_started_at = NULL,
        status = 'finished',
        result = ${result}::game_result,
        termination = 'timeout',
        version = version + 1,
        finished_at = ${receivedAt.toISOString()},
        updated_at = now()
      WHERE id = ${gameId} AND status = 'active'
    `;
    await transaction`
      INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
      VALUES (
        'game',
        ${gameId},
        'game.finished',
        ${JSON.stringify({ gameId, result, termination: 'timeout' })}::jsonb
      )
    `;
    const pgn = rules.pgn();
    const digest = createHash('sha256').update(pgn).digest('hex');
    await transaction`
      INSERT INTO game_pgn (game_id, pgn, checksum_sha256)
      VALUES (${gameId}, ${pgn}, ${digest})
      ON CONFLICT (game_id) DO UPDATE SET
        pgn = EXCLUDED.pgn,
        checksum_sha256 = EXCLUDED.checksum_sha256,
        generated_at = now()
    `;
    return true;
  });
}
