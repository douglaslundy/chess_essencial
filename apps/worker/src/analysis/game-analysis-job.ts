import { classifyMove } from '@xadrez/chess-domain';
import type { Sql } from 'postgres';

import { evaluatePosition, type EngineEvaluation } from '../engine/stockfish-engine.js';

const ANALYSIS_DEPTH = 14;
const MAX_NEWLY_QUEUED_PER_TICK = 20;

interface MoveRow {
  color: 'white' | 'black';
  fenAfter: string;
  fenBefore: string;
  ply: number;
}

let running = false;

/**
 * Picks up one finished game without an analysis yet, evaluates every
 * position along the game with the worker's Stockfish engine (one
 * evaluation per ply, reused for both the "before" of a move and the
 * negated "after" of the previous one — see stockfish-engine.ts), classifies
 * each move with @xadrez/chess-domain's classifyMove, and persists per-move
 * + aggregate results.
 *
 * Processes at most one game per call and guards against overlapping ticks:
 * a full game means one fresh engine subprocess per ply, sequentially (never
 * in parallel — this VPS is shared with unrelated third-party containers),
 * so a single game can legitimately take from several seconds to a couple
 * of minutes.
 */
export async function runGameAnalysisJob(sql: Sql): Promise<{ analyzedGameId: string | null }> {
  if (running) return { analyzedGameId: null };
  running = true;
  try {
    await queuePendingAnalyses(sql);
    const claimed = await claimNextAnalysis(sql);
    if (!claimed) return { analyzedGameId: null };

    try {
      await analyzeGame(sql, claimed.gameId, claimed.engineDepth);
      await sql`
        UPDATE game_analyses SET status = 'completed', completed_at = now()
        WHERE game_id = ${claimed.gameId}
      `;
    } catch (error) {
      await sql`
        UPDATE game_analyses SET status = 'failed', completed_at = now(),
          error = ${error instanceof Error ? error.message : String(error)}
        WHERE game_id = ${claimed.gameId}
      `;
    }
    return { analyzedGameId: claimed.gameId };
  } finally {
    running = false;
  }
}

async function queuePendingAnalyses(sql: Sql): Promise<void> {
  await sql`
    INSERT INTO game_analyses (game_id, status, engine_depth)
    SELECT g.id, 'pending', ${ANALYSIS_DEPTH}
    FROM games g
    LEFT JOIN game_analyses a ON a.game_id = g.id
    WHERE g.status = 'finished' AND a.game_id IS NULL
    ORDER BY g.finished_at DESC
    LIMIT ${MAX_NEWLY_QUEUED_PER_TICK}
    ON CONFLICT (game_id) DO NOTHING
  `;
}

async function claimNextAnalysis(
  sql: Sql,
): Promise<{ engineDepth: number; gameId: string } | null> {
  const [claimed] = await sql<{ engineDepth: number; gameId: string }[]>`
    UPDATE game_analyses SET status = 'processing', started_at = now()
    WHERE game_id = (
      SELECT game_id FROM game_analyses
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING game_id AS "gameId", engine_depth AS "engineDepth"
  `;
  return claimed ?? null;
}

function negate(evaluation: EngineEvaluation): { mate: number | null; scoreCp: number | null } {
  return {
    mate: evaluation.mate === null ? null : -evaluation.mate,
    scoreCp: evaluation.scoreCp === null ? null : -evaluation.scoreCp,
  };
}

async function analyzeGame(sql: Sql, gameId: string, depth: number): Promise<void> {
  const moves = await sql<MoveRow[]>`
    SELECT ply, color, fen_before AS "fenBefore", fen_after AS "fenAfter"
    FROM game_moves WHERE game_id = ${gameId} ORDER BY ply
  `;
  const [firstMove] = moves;
  if (!firstMove) return;

  // evaluations[i] is the position reached after i plies (evaluations[0] is
  // the position before the first move). Each fen_after equals the next
  // move's fen_before, so this is exactly one evaluation per ply, not two.
  const fens = [firstMove.fenBefore, ...moves.map((move) => move.fenAfter)];
  const evaluations: EngineEvaluation[] = [];
  for (const fen of fens) {
    evaluations.push(await evaluatePosition(fen, { depth }));
  }

  for (const move of moves) {
    const before = evaluations[move.ply - 1]!;
    const after = negate(evaluations[move.ply]!);
    const result = classifyMove({
      mateAfter: after.mate,
      mateBefore: before.mate,
      scoreAfterCp: after.scoreCp,
      scoreBeforeCp: before.scoreCp,
    });
    await sql`
      INSERT INTO game_move_analyses (
        game_id, ply, color, score_before_cp, mate_before, score_after_cp, mate_after,
        best_move_uci, centipawn_loss, quality, missed_win
      ) VALUES (
        ${gameId}, ${move.ply}, ${move.color}::color_side, ${before.scoreCp}, ${before.mate},
        ${after.scoreCp}, ${after.mate}, ${before.bestMove}, ${result.centipawnLoss},
        ${result.quality}::move_quality, ${result.missedWin}
      )
      ON CONFLICT (game_id, ply) DO NOTHING
    `;
  }
}
