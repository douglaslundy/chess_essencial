import type { AiProvider, MoveQuality } from '@xadrez/contracts';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { Sql } from 'postgres';

import { recordGameNarration } from '../analysis/analysis-metrics.js';
import { decryptSecret } from '../config/secret-cipher.js';
import { freshChatgptAccessToken } from './chatgpt-token.js';
import { callLlm, type LlmConfig } from './llm-client.js';
import {
  buildGameSummaryPrompt,
  buildMomentPrompt,
  NARRATION_SYSTEM_PROMPT,
  type MomentFacts,
  type NarratedMoment,
} from './prompts.js';

const MAX_NEWLY_QUEUED_PER_TICK = 1;
const NARRATION_FEATURE_KEY = 'ai_narrations_per_day';
// Paid generation deliberately fails closed when no effective plan exists,
// even though interactive entitlement checks fail open on plan misconfiguration.
// The deterministic browser narration remains available without any LLM cost.
const MAX_KEY_MOMENTS = 6;
const NARRATION_LEASE_MINUTES = 15;
const MAX_NARRATION_ATTEMPTS = 3;

interface ActiveAiProviderKeyRow {
  encryptedApiKey: string | null;
  model: string | null;
  provider: AiProvider;
}

interface MoveAnalysisRow {
  bestMoveUci: string | null;
  centipawnLoss: number;
  color: 'white' | 'black';
  fenBefore: string;
  missedWin: boolean;
  ply: number;
  quality: MoveQuality;
  san: string;
  uci: string;
}

interface GameMetaRow {
  result: string;
  termination: string;
  timeControl: string;
}

let running = false;

/**
 * Picks up one game whose Stockfish analysis (game-analysis-job.ts) has
 * completed and generates a spoken-language narration for the post-game
 * review: a per-key-moment explanation, plus a whole-game summary,
 * recurring patterns and a short study plan. Every chess fact (move,
 * quality, centipawn loss, best move) is already computed by the engine
 * pipeline — the LLM only turns those facts into natural Portuguese.
 *
 * Per-key-moment narrations are cached in move_narration_cache, keyed by
 * the exact (position, move played, engine's best alternative, quality)
 * tuple, so the same tactical moment recurring across different games or
 * users (openings, common blunders, bot games) is looked up instead of
 * paying for another LLM call.
 */
export async function runGameNarrationJob(
  sql: Sql,
  encryptionKey: string,
): Promise<{ narratedGameId: string | null }> {
  if (running) return { narratedGameId: null };
  running = true;
  try {
    const config = await resolveNarrationAiConfig(sql, encryptionKey);
    if (!config) return { narratedGameId: null };

    await queuePendingNarrations(sql);
    const claimed = await claimNextNarration(sql);
    if (!claimed) return { narratedGameId: null };

    const startedAt = performance.now();
    let outcome: 'completed' | 'failed' = 'completed';
    try {
      await narrateGame(sql, claimed.gameId, config);
      await sql`
        UPDATE game_narrations
        SET status = 'completed', completed_at = now(), lease_expires_at = NULL
        WHERE game_id = ${claimed.gameId}
      `;
    } catch (error) {
      outcome = 'failed';
      await scheduleNarrationRetry(sql, claimed.gameId, claimed.attemptCount, error);
    } finally {
      const durationMs = performance.now() - startedAt;
      const snapshot = recordGameNarration(durationMs);
      console.info('worker.narration.metrics', {
        durationMs,
        heartbeatDecision: snapshot.narrationHeartbeatDecision,
        outcome,
        p99Ms: snapshot.narrationDurationMs.p99,
      });
    }
    return { narratedGameId: claimed.gameId };
  } finally {
    running = false;
  }
}

async function resolveNarrationAiConfig(
  sql: Sql,
  encryptionKey: string,
): Promise<LlmConfig | null> {
  const [row] = await sql<ActiveAiProviderKeyRow[]>`
    SELECT provider, model, encrypted_api_key AS "encryptedApiKey"
    FROM ai_provider_keys
    WHERE is_active = true
  `;
  if (!row?.encryptedApiKey || !row.model) return null;
  return {
    apiKey:
      row.provider === 'chatgpt'
        ? ((await freshChatgptAccessToken(sql, encryptionKey)) ??
          decryptSecret(row.encryptedApiKey, encryptionKey))
        : decryptSecret(row.encryptedApiKey, encryptionKey),
    model: row.model,
    provider: row.provider,
  };
}

async function queuePendingNarrations(sql: Sql): Promise<void> {
  // Queue one game at a time: the row itself reserves one daily-quota slot
  // for each human player. Enqueuing a batch from one pre-insert snapshot
  // could reserve more games than a finite plan allows.
  await sql`
    INSERT INTO game_narrations (game_id, status)
    SELECT a.game_id, 'pending'
    FROM game_analyses a
    LEFT JOIN game_narrations n ON n.game_id = a.game_id
    WHERE a.status = 'completed' AND n.game_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM game_players gp
        CROSS JOIN LATERAL (
          SELECT COALESCE(
            (
              SELECT subscription.plan_id
              FROM user_subscriptions subscription
              WHERE subscription.user_id = gp.user_id AND subscription.status = 'active'
              ORDER BY subscription.created_at DESC
              LIMIT 1
            ),
            (
              SELECT default_plan.id
              FROM subscription_plans default_plan
              WHERE default_plan.is_default = true
              LIMIT 1
            )
          ) AS plan_id
        ) effective_plan
        WHERE gp.game_id = a.game_id
          AND NOT EXISTS (
            SELECT 1 FROM bot_personas persona WHERE persona.user_id = gp.user_id
          )
          AND NOT EXISTS (
            SELECT 1 FROM game_bots bot
            WHERE bot.game_id = a.game_id AND bot.bot_user_id = gp.user_id
          )
          AND (
            EXISTS (
              SELECT 1 FROM user_roles role
              WHERE role.user_id = gp.user_id AND role.role = 'admin'
            )
            OR EXISTS (
              SELECT 1
              FROM subscription_plan_limits quota
              WHERE quota.plan_id = effective_plan.plan_id
                AND quota.feature_key = ${NARRATION_FEATURE_KEY}
                AND (
                  quota.daily_limit = 0
                  OR (
                    SELECT count(DISTINCT existing.game_id)::integer
                    FROM game_narrations existing
                    JOIN game_players existing_player
                      ON existing_player.game_id = existing.game_id
                    WHERE existing_player.user_id = gp.user_id
                      AND COALESCE(existing.started_at, existing.created_at) >= date_trunc('day', now())
                      AND COALESCE(existing.started_at, existing.created_at) <
                        date_trunc('day', now()) + interval '1 day'
                  ) < quota.daily_limit
                )
            )
          )
      )
    ORDER BY a.completed_at DESC
    LIMIT ${MAX_NEWLY_QUEUED_PER_TICK}
    ON CONFLICT (game_id) DO NOTHING
  `;
}

async function claimNextNarration(
  sql: Sql,
): Promise<{ attemptCount: number; gameId: string } | null> {
  // Re-check immediately before the paid call. This catches plan changes
  // after enqueue and also protects pending rows created by older releases.
  // The candidate row is excluded from its own quota count because it is the
  // reservation currently being claimed. An expired/null lease makes an
  // interrupted processing row eligible again without parallelizing work.
  // ::text::jsonb: a bare ::jsonb parameter is serialized again by postgres.js (stored a JSON string).
  await sql`
    UPDATE game_narrations
    SET completed_at = now(), status = 'failed', lease_expires_at = NULL,
        error = COALESCE(error, 'Lease expirou após o limite de tentativas')
    WHERE attempt_count >= ${MAX_NARRATION_ATTEMPTS}
      AND (
        (status = 'pending' AND next_attempt_at <= now())
        OR (
          status = 'processing'
          AND (lease_expires_at IS NULL OR lease_expires_at <= now())
        )
      )
  `;
  const [claimed] = await sql<{ attemptCount: number; gameId: string }[]>`
    UPDATE game_narrations AS target
    SET status = 'processing', started_at = now(), completed_at = NULL,
        error = NULL, attempt_count = target.attempt_count + 1,
        lease_expires_at = now() + ${NARRATION_LEASE_MINUTES} * interval '1 minute'
    WHERE target.game_id = (
      SELECT candidate.game_id
      FROM game_narrations candidate
      WHERE candidate.attempt_count < ${MAX_NARRATION_ATTEMPTS}
        AND (
          (candidate.status = 'pending' AND candidate.next_attempt_at <= now())
          OR (
            candidate.status = 'processing'
            AND (candidate.lease_expires_at IS NULL OR candidate.lease_expires_at <= now())
          )
        )
        AND EXISTS (
          SELECT 1
          FROM game_players gp
          CROSS JOIN LATERAL (
            SELECT COALESCE(
              (
                SELECT subscription.plan_id
                FROM user_subscriptions subscription
                WHERE subscription.user_id = gp.user_id AND subscription.status = 'active'
                ORDER BY subscription.created_at DESC
                LIMIT 1
              ),
              (
                SELECT default_plan.id
                FROM subscription_plans default_plan
                WHERE default_plan.is_default = true
                LIMIT 1
              )
            ) AS plan_id
          ) effective_plan
          WHERE gp.game_id = candidate.game_id
            AND NOT EXISTS (
              SELECT 1 FROM bot_personas persona WHERE persona.user_id = gp.user_id
            )
            AND NOT EXISTS (
              SELECT 1 FROM game_bots bot
              WHERE bot.game_id = candidate.game_id AND bot.bot_user_id = gp.user_id
            )
            AND (
              EXISTS (
                SELECT 1 FROM user_roles role
                WHERE role.user_id = gp.user_id AND role.role = 'admin'
              )
              OR EXISTS (
                SELECT 1
                FROM subscription_plan_limits quota
                WHERE quota.plan_id = effective_plan.plan_id
                  AND quota.feature_key = ${NARRATION_FEATURE_KEY}
                  AND (
                    quota.daily_limit = 0
                    OR (
                      SELECT count(DISTINCT existing.game_id)::integer
                      FROM game_narrations existing
                      JOIN game_players existing_player
                        ON existing_player.game_id = existing.game_id
                      WHERE existing_player.user_id = gp.user_id
                        AND existing.game_id <> candidate.game_id
                        AND COALESCE(existing.started_at, existing.created_at) >=
                          date_trunc('day', now())
                        AND COALESCE(existing.started_at, existing.created_at) <
                          date_trunc('day', now()) + interval '1 day'
                    ) < quota.daily_limit
                  )
              )
            )
        )
      ORDER BY candidate.created_at ASC
      LIMIT 1
      FOR UPDATE OF candidate SKIP LOCKED
    )
    RETURNING target.game_id AS "gameId", target.attempt_count AS "attemptCount"
  `;
  return claimed ?? null;
}

async function scheduleNarrationRetry(
  sql: Sql,
  gameId: string,
  attemptCount: number,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  if (attemptCount >= MAX_NARRATION_ATTEMPTS) {
    await sql`
      UPDATE game_narrations
      SET status = 'failed', completed_at = now(), lease_expires_at = NULL, error = ${message}
      WHERE game_id = ${gameId}
    `;
    return;
  }
  await sql`
    UPDATE game_narrations
    SET status = 'pending', completed_at = NULL, lease_expires_at = NULL,
        error = ${message},
        next_attempt_at = now() + ${attemptCount} * interval '1 minute'
    WHERE game_id = ${gameId}
  `;
}

function cacheKeyFor(moment: MomentFacts, fenBefore: string): string {
  return createHash('sha256')
    .update(`${fenBefore}|${moment.uci}|${moment.bestMoveUci ?? ''}|${moment.quality}`)
    .digest('hex');
}

function selectKeyMoments(rows: MoveAnalysisRow[]): MoveAnalysisRow[] {
  return [...rows]
    .sort((a, b) => b.centipawnLoss - a.centipawnLoss || Number(b.missedWin) - Number(a.missedWin))
    .slice(0, MAX_KEY_MOMENTS)
    .sort((a, b) => a.ply - b.ply);
}

async function narrateMomentWithCache(
  sql: Sql,
  row: MoveAnalysisRow,
  config: LlmConfig,
): Promise<NarratedMoment> {
  const facts: MomentFacts = {
    bestMoveUci: row.bestMoveUci,
    centipawnLoss: row.centipawnLoss,
    color: row.color,
    missedWin: row.missedWin,
    ply: row.ply,
    quality: row.quality,
    san: row.san,
    uci: row.uci,
  };
  const cacheKey = cacheKeyFor(facts, row.fenBefore);

  const [cached] = await sql<{ narrative: string }[]>`
    SELECT narrative FROM move_narration_cache WHERE cache_key = ${cacheKey}
  `;
  if (cached) {
    await sql`
      UPDATE move_narration_cache
      SET hit_count = hit_count + 1, last_used_at = now()
      WHERE cache_key = ${cacheKey}
    `;
    return { ...facts, narrative: cached.narrative };
  }

  const narrative = await callLlm(config, NARRATION_SYSTEM_PROMPT, buildMomentPrompt(facts));
  await sql`
    INSERT INTO move_narration_cache (
      cache_key, fen_before, move_uci, best_move_uci, quality, narrative
    ) VALUES (
      ${cacheKey}, ${row.fenBefore}, ${row.uci}, ${row.bestMoveUci}, ${row.quality}::move_quality, ${narrative}
    )
    ON CONFLICT (cache_key) DO NOTHING
  `;
  return { ...facts, narrative };
}

function emptyQualityCounts(): Record<MoveQuality | 'missedWin', number> {
  return { bom: 0, erro: 0, excelente: 0, gafe: 0, imprecisao: 0, missedWin: 0, otimo: 0 };
}

function tallyQuality(rows: MoveAnalysisRow[], color: 'white' | 'black') {
  const counts = emptyQualityCounts();
  for (const row of rows) {
    if (row.color !== color) continue;
    counts[row.quality] = (counts[row.quality] ?? 0) + 1;
    if (row.missedWin) counts.missedWin = (counts.missedWin ?? 0) + 1;
  }
  return counts;
}

interface GameNarrationResult {
  patterns: string[];
  studyPlan: string[];
  summary: string;
}

function parseGameSummaryResponse(raw: string): GameNarrationResult {
  const jsonText = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  const parsed = JSON.parse(jsonText) as {
    padroes?: unknown;
    planoDeEstudo?: unknown;
    resumo?: unknown;
  };
  if (typeof parsed.resumo !== 'string') throw new Error('Resposta da IA sem "resumo" válido');
  const patterns = Array.isArray(parsed.padroes)
    ? parsed.padroes.filter((item): item is string => typeof item === 'string')
    : [];
  const studyPlan = Array.isArray(parsed.planoDeEstudo)
    ? parsed.planoDeEstudo.filter((item): item is string => typeof item === 'string')
    : [];
  return { patterns, studyPlan, summary: parsed.resumo };
}

async function narrateGame(sql: Sql, gameId: string, config: LlmConfig): Promise<void> {
  const [game] = await sql<GameMetaRow[]>`
    SELECT games.result::text, games.termination::text,
      controls.label AS "timeControl"
    FROM games
    JOIN game_time_controls controls ON controls.id = games.time_control_id
    WHERE games.id = ${gameId}
  `;
  if (!game) throw new Error(`Partida ${gameId} não encontrada`);

  const rows = await sql<MoveAnalysisRow[]>`
    SELECT
      gm.ply::integer, gm.color, gm.san, gm.uci, gm.fen_before AS "fenBefore",
      gma.best_move_uci AS "bestMoveUci", gma.centipawn_loss AS "centipawnLoss",
      gma.quality, gma.missed_win AS "missedWin"
    FROM game_move_analyses gma
    JOIN game_moves gm ON gm.game_id = gma.game_id AND gm.ply = gma.ply
    WHERE gma.game_id = ${gameId}
    ORDER BY gma.ply
  `;

  const keyMoments = selectKeyMoments(rows);
  const narratedMoments: NarratedMoment[] = [];
  for (const moment of keyMoments) {
    narratedMoments.push(await narrateMomentWithCache(sql, moment, config));
  }

  const qualityCounts = {
    black: tallyQuality(rows, 'black'),
    white: tallyQuality(rows, 'white'),
  };

  const summaryResponse = await callLlm(
    config,
    NARRATION_SYSTEM_PROMPT,
    buildGameSummaryPrompt(
      game.result,
      game.termination,
      game.timeControl,
      rows.length,
      qualityCounts,
      narratedMoments,
    ),
  );
  const { patterns, studyPlan, summary } = parseGameSummaryResponse(summaryResponse);

  const keyMomentsJson = narratedMoments.map((moment) => ({
    color: moment.color,
    narrative: moment.narrative,
    ply: moment.ply,
    quality: moment.quality,
    san: moment.san,
  }));

  // ::text::jsonb: a bare ::jsonb parameter is serialized again by postgres.js (stored a JSON string).
  await sql`
    UPDATE game_narrations
    SET summary = ${summary},
        key_moments = ${JSON.stringify(keyMomentsJson)}::text::jsonb,
        patterns = ${JSON.stringify(patterns)}::text::jsonb,
        study_plan = ${JSON.stringify(studyPlan)}::text::jsonb
    WHERE game_id = ${gameId}
  `;
}
