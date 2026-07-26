import type { MoveQuality, NarrationAiProvider } from '@xadrez/contracts';
import { createHash } from 'node:crypto';
import type { Sql } from 'postgres';

import { callLlm, type LlmConfig } from './llm-client.js';
import {
  buildGameSummaryPrompt,
  buildMomentPrompt,
  NARRATION_SYSTEM_PROMPT,
  type MomentFacts,
  type NarratedMoment,
} from './prompts.js';

const NARRATION_SETTINGS_KEY = 'ai.narration';
const MAX_NEWLY_QUEUED_PER_TICK = 20;
const MAX_KEY_MOMENTS = 6;

interface StoredNarrationAiConfig {
  apiKey: string | null;
  model: string;
  provider: NarrationAiProvider;
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
export async function runGameNarrationJob(sql: Sql): Promise<{ narratedGameId: string | null }> {
  if (running) return { narratedGameId: null };
  running = true;
  try {
    const config = await resolveNarrationAiConfig(sql);
    if (!config) return { narratedGameId: null };

    await queuePendingNarrations(sql);
    const claimed = await claimNextNarration(sql);
    if (!claimed) return { narratedGameId: null };

    try {
      await narrateGame(sql, claimed.gameId, config);
      await sql`
        UPDATE game_narrations SET status = 'completed', completed_at = now()
        WHERE game_id = ${claimed.gameId}
      `;
    } catch (error) {
      await sql`
        UPDATE game_narrations SET status = 'failed', completed_at = now(),
          error = ${error instanceof Error ? error.message : String(error)}
        WHERE game_id = ${claimed.gameId}
      `;
    }
    return { narratedGameId: claimed.gameId };
  } finally {
    running = false;
  }
}

async function resolveNarrationAiConfig(sql: Sql): Promise<LlmConfig | null> {
  const [row] = await sql<{ value: StoredNarrationAiConfig }[]>`
    SELECT value FROM platform_settings WHERE key = ${NARRATION_SETTINGS_KEY}
  `;
  if (!row?.value.apiKey) return null;
  return { apiKey: row.value.apiKey, model: row.value.model, provider: row.value.provider };
}

async function queuePendingNarrations(sql: Sql): Promise<void> {
  await sql`
    INSERT INTO game_narrations (game_id, status)
    SELECT a.game_id, 'pending'
    FROM game_analyses a
    LEFT JOIN game_narrations n ON n.game_id = a.game_id
    WHERE a.status = 'completed' AND n.game_id IS NULL
    ORDER BY a.completed_at DESC
    LIMIT ${MAX_NEWLY_QUEUED_PER_TICK}
    ON CONFLICT (game_id) DO NOTHING
  `;
}

async function claimNextNarration(sql: Sql): Promise<{ gameId: string } | null> {
  const [claimed] = await sql<{ gameId: string }[]>`
    UPDATE game_narrations SET status = 'processing', started_at = now()
    WHERE game_id = (
      SELECT game_id FROM game_narrations
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING game_id AS "gameId"
  `;
  return claimed ?? null;
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

  await sql`
    UPDATE game_narrations
    SET summary = ${summary},
        key_moments = ${JSON.stringify(keyMomentsJson)}::jsonb,
        patterns = ${JSON.stringify(patterns)}::jsonb,
        study_plan = ${JSON.stringify(studyPlan)}::jsonb
    WHERE game_id = ${gameId}
  `;
}
