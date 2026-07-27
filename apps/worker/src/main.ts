import { Redis } from 'ioredis';
import postgres from 'postgres';

import { runGameAnalysisJob } from './analysis/game-analysis-job.js';
import { runAutoAcceptFriendRequests } from './bots/auto-accept-job.js';
import { runPresenceSchedule } from './bots/presence-job.js';
import { runBotQueueJob } from './bots/queue-job.js';
import { parseWorkerEnv } from './config/env.js';
import { runExpireTimedOutGamesJob } from './games/expire-timed-out-games-job.js';
import { createHealthServer } from './health-server.js';
import { runGameNarrationJob } from './narration/game-narration-job.js';
import { runExpirePastDueJob } from './subscriptions/expire-past-due-job.js';
import { createSystemWorker } from './system.worker.js';

const PRESENCE_INTERVAL_MS = 60_000;
const AUTO_ACCEPT_INTERVAL_MS = 10_000;
const QUEUE_INTERVAL_MS = 30_000;
const ANALYSIS_INTERVAL_MS = 30_000;
// Short poll — this is the durability backstop for a per-game timer that's
// normally already precise to the millisecond (see games.gateway.ts); it
// only ever matters when nobody reconnected after the API restarted, so a
// tight interval costs almost nothing (cheap SELECT, no candidates most
// ticks) while keeping the exposure window small.
const EXPIRE_TIMED_OUT_GAMES_INTERVAL_MS = 15_000;
// Runs less often than the engine analysis it depends on: it's a paid LLM
// call, so there's no benefit to polling as tightly as the free local
// engine job, and most ticks will find nothing new to narrate anyway.
const NARRATION_INTERVAL_MS = 60_000;
// Whether a subscription is past due only matters for gating (área 6), not
// anything time-sensitive — a slow poll is plenty.
const EXPIRE_PAST_DUE_SUBSCRIPTIONS_INTERVAL_MS = 600_000;

const env = parseWorkerEnv(process.env);
const worker = createSystemWorker(env.REDIS_URL);
const healthServer = createHealthServer();
const sql = postgres(env.DATABASE_URL, { max: 5, prepare: false });
const redis = new Redis(env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 2 });

worker.on('error', (error) => {
  console.error('worker.connection_error', { message: error.message });
});

worker.on('failed', (job, error) => {
  console.error('worker.job_failed', { jobId: job?.id, message: error.message });
});

const presenceInterval = setInterval(() => {
  runPresenceSchedule(sql, redis).catch((error: unknown) => {
    console.error('worker.bots.presence_failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  });
}, PRESENCE_INTERVAL_MS);

const autoAcceptInterval = setInterval(() => {
  runAutoAcceptFriendRequests(sql).catch((error: unknown) => {
    console.error('worker.bots.auto_accept_failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  });
}, AUTO_ACCEPT_INTERVAL_MS);

const queueInterval = setInterval(() => {
  runBotQueueJob(sql, redis).catch((error: unknown) => {
    console.error('worker.bots.queue_failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  });
}, QUEUE_INTERVAL_MS);

const analysisInterval = setInterval(() => {
  runGameAnalysisJob(sql).catch((error: unknown) => {
    console.error('worker.analysis.game_analysis_failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  });
}, ANALYSIS_INTERVAL_MS);

const narrationInterval = setInterval(() => {
  runGameNarrationJob(sql, env.SETTINGS_ENCRYPTION_KEY).catch((error: unknown) => {
    console.error('worker.narration.game_narration_failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  });
}, NARRATION_INTERVAL_MS);

const expireTimedOutGamesInterval = setInterval(() => {
  runExpireTimedOutGamesJob(sql).catch((error: unknown) => {
    console.error('worker.games.expire_timed_out_failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  });
}, EXPIRE_TIMED_OUT_GAMES_INTERVAL_MS);

const expirePastDueInterval = setInterval(() => {
  runExpirePastDueJob(sql).catch((error: unknown) => {
    console.error('worker.subscriptions.expire_past_due_failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  });
}, EXPIRE_PAST_DUE_SUBSCRIPTIONS_INTERVAL_MS);

healthServer.listen(env.WORKER_HEALTH_PORT, '0.0.0.0');

async function shutdown() {
  clearInterval(presenceInterval);
  clearInterval(autoAcceptInterval);
  clearInterval(queueInterval);
  clearInterval(analysisInterval);
  clearInterval(narrationInterval);
  clearInterval(expireTimedOutGamesInterval);
  clearInterval(expirePastDueInterval);
  healthServer.close();
  await worker.close();
  await redis.quit();
  await sql.end({ timeout: 5 });
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
