import { classifyMove } from '@xadrez/chess-domain';
import { performance } from 'node:perf_hooks';
import type { Sql } from 'postgres';

import { evaluatePosition, type EngineEvaluation } from '../engine/stockfish-engine.js';
import {
  finishRuntimeResourceMeasurement,
  recordEngineEvaluation,
  recordGameAnalysis,
  startRuntimeResourceMeasurement,
} from './analysis-metrics.js';

const ANALYSIS_DEPTH = 14;
const MAX_NEWLY_QUEUED_PER_TICK = 20;
const ANALYSIS_LEASE_MINUTES = 30;
const MAX_ANALYSIS_ATTEMPTS = 3;

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
        UPDATE game_analyses
        SET status = 'completed', completed_at = now(), lease_expires_at = NULL
        WHERE game_id = ${claimed.gameId}
      `;
    } catch (error) {
      await scheduleAnalysisRetry(sql, claimed.gameId, claimed.attemptCount, error);
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
): Promise<{ attemptCount: number; engineDepth: number; gameId: string } | null> {
  await sql`
    UPDATE game_analyses
    SET completed_at = now(), status = 'failed', lease_expires_at = NULL,
        error = COALESCE(error, 'Lease expirou após o limite de tentativas')
    WHERE attempt_count >= ${MAX_ANALYSIS_ATTEMPTS}
      AND (
        (status = 'pending' AND next_attempt_at <= now())
        OR (
          status = 'processing'
          AND (lease_expires_at IS NULL OR lease_expires_at <= now())
        )
      )
  `;
  const [claimed] = await sql<{ attemptCount: number; engineDepth: number; gameId: string }[]>`
    UPDATE game_analyses AS target
    SET status = 'processing', started_at = now(), completed_at = NULL,
        error = NULL, attempt_count = target.attempt_count + 1,
        lease_expires_at = now() + ${ANALYSIS_LEASE_MINUTES} * interval '1 minute'
    WHERE target.game_id = (
      SELECT candidate.game_id
      FROM game_analyses candidate
      WHERE candidate.attempt_count < ${MAX_ANALYSIS_ATTEMPTS}
        AND (
          (candidate.status = 'pending' AND candidate.next_attempt_at <= now())
          OR (
            candidate.status = 'processing'
            AND (candidate.lease_expires_at IS NULL OR candidate.lease_expires_at <= now())
          )
        )
      ORDER BY candidate.created_at
      LIMIT 1
      FOR UPDATE OF candidate SKIP LOCKED
    )
    RETURNING target.game_id AS "gameId", target.engine_depth AS "engineDepth",
      target.attempt_count AS "attemptCount"
  `;
  return claimed ?? null;
}

async function scheduleAnalysisRetry(
  sql: Sql,
  gameId: string,
  attemptCount: number,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  if (attemptCount >= MAX_ANALYSIS_ATTEMPTS) {
    await sql`
      UPDATE game_analyses
      SET status = 'failed', completed_at = now(), lease_expires_at = NULL, error = ${message}
      WHERE game_id = ${gameId}
    `;
    return;
  }
  await sql`
    UPDATE game_analyses
    SET status = 'pending', completed_at = NULL, lease_expires_at = NULL,
        error = ${message},
        next_attempt_at = now() + ${attemptCount} * interval '1 minute'
    WHERE game_id = ${gameId}
  `;
}

function negate(evaluation: EngineEvaluation): { mate: number | null; scoreCp: number | null } {
  return {
    mate: evaluation.mate === null ? null : -evaluation.mate,
    scoreCp: evaluation.scoreCp === null ? null : -evaluation.scoreCp,
  };
}

async function analyzeGame(sql: Sql, gameId: string, depth: number): Promise<void> {
  const startedAt = performance.now();
  const resourceStart = await startRuntimeResourceMeasurement();
  let outcome: 'completed' | 'failed' = 'completed';
  let positionsEvaluated = 0;
  try {
    positionsEvaluated = await analyzeGameCore(sql, gameId, depth);
  } catch (error) {
    outcome = 'failed';
    throw error;
  } finally {
    const resources = await finishRuntimeResourceMeasurement(resourceStart);
    const snapshot = recordGameAnalysis({
      cpuMs: resources.cpuMs,
      depth,
      durationMs: performance.now() - startedAt,
      memoryCurrentBytes: resources.memoryCurrentBytes,
      memoryPeakBytes: resources.memoryPeakBytes,
      outcome,
      positionsEvaluated,
      resourceScope: resources.scope,
    });
    console.info('worker.analysis.stockfish_metrics', {
      engineEvaluationP99Ms: snapshot.engineEvaluationDurationMs.p99,
      gameAnalysisP99Ms: snapshot.gameAnalysisDurationMs.p99,
      heartbeatDecision: snapshot.analysisHeartbeatDecision,
      latest: snapshot.latest,
    });
  }
}

async function analyzeGameCore(sql: Sql, gameId: string, depth: number): Promise<number> {
  const moves = await sql<MoveRow[]>`
    SELECT ply, color, fen_before AS "fenBefore", fen_after AS "fenAfter"
    FROM game_moves WHERE game_id = ${gameId} ORDER BY ply
  `;
  const [firstMove] = moves;
  if (!firstMove) return 0;

  // evaluations[i] is the position reached after i plies (evaluations[0] is
  // the position before the first move). Each fen_after equals the next
  // move's fen_before, so this is exactly one evaluation per ply, not two.
  const fens = [firstMove.fenBefore, ...moves.map((move) => move.fenAfter)];
  const evaluations: EngineEvaluation[] = [];
  for (const fen of fens) {
    const evaluationStartedAt = performance.now();
    try {
      evaluations.push(await evaluatePosition(fen, { depth }));
    } finally {
      recordEngineEvaluation(performance.now() - evaluationStartedAt);
    }
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

  await recordLearningSignals(sql, gameId);
  return fens.length;
}

/**
 * Builds the smallest defensible learning loop from objective engine facts.
 * A centipawn loss cannot prove a fork, pin, or opening misconception, so
 * v1 emits only two broad skills. Every write is idempotent: a reclaimed
 * analysis lease can safely run this projection again.
 */
async function recordLearningSignals(sql: Sql, gameId: string): Promise<void> {
  await sql`
    INSERT INTO game_error_signals (
      game_id, ply, user_id, skill_key, signal_type, confidence, rule_version, evidence
    )
    SELECT
      gma.game_id,
      gma.ply,
      gp.user_id,
      CASE WHEN gma.missed_win THEN 'tactical_awareness' ELSE 'move_safety' END,
      CASE WHEN gma.missed_win THEN 'missed_opportunity' ELSE 'unsafe_move' END,
      CASE WHEN gma.missed_win THEN 0.950 WHEN gma.quality = 'gafe' THEN 0.900 ELSE 0.800 END,
      'stockfish_error_signal_v2',
      jsonb_strip_nulls(jsonb_build_object(
        'centipawnLoss', gma.centipawn_loss,
        'detectedTheme',
          CASE
            WHEN gma.missed_win AND gma.mate_before > 0 THEN 'missed_forced_mate'
            ELSE NULL
          END,
        'missedWin', gma.missed_win,
        'quality', gma.quality
      ))
    FROM game_move_analyses gma
    JOIN game_players gp ON gp.game_id = gma.game_id AND gp.color = gma.color
    LEFT JOIN game_bots gb ON gb.game_id = gp.game_id AND gb.bot_user_id = gp.user_id
    WHERE gma.game_id = ${gameId}
      AND gb.game_id IS NULL
      AND (gma.missed_win OR gma.quality IN ('erro', 'gafe'))
    ON CONFLICT (game_id, ply, user_id, skill_key) DO NOTHING
  `;

  await sql`
    WITH inserted AS (
      INSERT INTO learning_evidence (
        error_signal_id, user_id, skill_key, source_type, outcome, weight, occurred_at
      )
      SELECT id, user_id, skill_key, 'game_error', 'error', confidence, created_at
      FROM game_error_signals
      WHERE game_id = ${gameId}
      ON CONFLICT (error_signal_id) DO NOTHING
      RETURNING user_id, skill_key
    ), totals AS (
      SELECT user_id, skill_key, count(*)::integer AS error_count
      FROM inserted
      GROUP BY user_id, skill_key
    )
    INSERT INTO skill_mastery (
      user_id, skill, attempts, success_count, error_count, score, last_seen_at
    )
    SELECT user_id, skill_key, error_count, 0, error_count, 0, now()
    FROM totals
    ON CONFLICT (user_id, skill) DO UPDATE SET
      attempts = skill_mastery.attempts + EXCLUDED.attempts,
      error_count = skill_mastery.error_count + EXCLUDED.error_count,
      score = ROUND(
        skill_mastery.success_count::numeric
          / (skill_mastery.attempts + EXCLUDED.attempts) * 100
      ),
      last_seen_at = now(),
      updated_at = now()
  `;

  await sql`
    INSERT INTO learning_recommendations (
      error_signal_id, user_id, skill_key, exercise_id, rationale
    )
    SELECT
      signal.id,
      signal.user_id,
      signal.skill_key,
      practice.id,
      CASE signal.skill_key
        WHEN 'tactical_awareness' THEN 'Pratique a identificação de oportunidades concretas.'
        ELSE 'Pratique a verificação de ameaças antes de confirmar o lance.'
      END
    FROM (
      SELECT
        ranked_signal.*,
        row_number() OVER (
          PARTITION BY ranked_signal.user_id, ranked_signal.skill_key
          ORDER BY ranked_signal.ply, ranked_signal.id
        ) - 1 AS batch_offset
      FROM game_error_signals ranked_signal
      WHERE ranked_signal.game_id = ${gameId}
    ) signal
    JOIN LATERAL (
      SELECT ranked_practice.id
      FROM (
        SELECT
          interleaved_practice.id,
          row_number() OVER (
            ORDER BY
              interleaved_practice.was_solved,
              interleaved_practice.was_recently_recommended,
              interleaved_practice.recommendation_count,
              interleaved_practice.last_recommended_at ASC NULLS FIRST,
              interleaved_practice.hints_empty,
              interleaved_practice.difficulty_position,
              interleaved_practice.difficulty_rank,
              interleaved_practice.tie_breaker
          ) AS candidate_rank,
          count(*) OVER () AS candidate_count
        FROM (
          SELECT
            candidate.*,
            row_number() OVER (
              PARTITION BY
                candidate.was_solved,
                candidate.was_recently_recommended,
                candidate.recommendation_count,
                candidate.last_recommended_at,
                candidate.hints_empty,
                candidate.difficulty_rank
              ORDER BY candidate.tie_breaker
            ) AS difficulty_position
          FROM (
            SELECT
              exercise.id,
              EXISTS (
                SELECT 1 FROM exercise_attempts attempt
                WHERE attempt.user_id = signal.user_id
                  AND attempt.exercise_id = exercise.id
                  AND attempt.correct = true
              ) AS was_solved,
              COALESCE(
                recommendation_history.last_recommended_at >= now() - interval '30 days',
                false
              ) AS was_recently_recommended,
              recommendation_history.recommendation_count,
              recommendation_history.last_recommended_at,
              jsonb_array_length(exercise.hints) = 0 AS hints_empty,
              CASE lower(COALESCE(exercise.difficulty, ''))
                WHEN 'beginner' THEN 1
                WHEN 'iniciante' THEN 1
                WHEN 'intermediate' THEN 2
                WHEN 'intermediario' THEN 2
                WHEN 'intermediário' THEN 2
                WHEN 'advanced' THEN 3
                WHEN 'avancado' THEN 3
                WHEN 'avançado' THEN 3
                WHEN 'expert' THEN 4
                WHEN 'especialista' THEN 4
                ELSE 5
              END AS difficulty_rank,
              md5(
                signal.game_id::text
                  || signal.user_id::text
                  || signal.skill_key
                  || exercise.id::text
              ) AS tie_breaker
            FROM (
              SELECT DISTINCT eligible_exercise.id
              FROM skill_tag_aliases alias
              JOIN exercises eligible_exercise ON alias.tag = ANY(eligible_exercise.tags)
              WHERE alias.skill_key = signal.skill_key
                AND eligible_exercise.status = 'published'
                AND eligible_exercise.position_type = 'legal_position'
                AND eligible_exercise.title IS NOT NULL
                AND COALESCE(
                  eligible_exercise.import_metadata->>'answerFormat',
                  'move_sequence'
                ) = 'move_sequence'
                AND jsonb_array_length(eligible_exercise.solution_lines) > 0
            ) eligible
            JOIN exercises exercise ON exercise.id = eligible.id
            LEFT JOIN LATERAL (
              SELECT
                count(*)::integer AS recommendation_count,
                max(previous.created_at) AS last_recommended_at
              FROM learning_recommendations previous
              WHERE previous.user_id = signal.user_id
                AND previous.exercise_id = exercise.id
            ) recommendation_history ON true
          ) candidate
        ) interleaved_practice
      ) ranked_practice
      WHERE ranked_practice.candidate_rank =
        mod(signal.batch_offset, ranked_practice.candidate_count) + 1
    ) practice ON true
    ON CONFLICT (error_signal_id) DO NOTHING
  `;
}
