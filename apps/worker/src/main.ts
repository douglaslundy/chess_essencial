import { Redis } from 'ioredis';
import postgres from 'postgres';

import { runGameAnalysisJob } from './analysis/game-analysis-job.js';
import { runAutoAcceptFriendRequests } from './bots/auto-accept-job.js';
import { runPresenceSchedule } from './bots/presence-job.js';
import { runBotQueueJob } from './bots/queue-job.js';
import { parseWorkerEnv } from './config/env.js';
import { createHealthServer } from './health-server.js';
import { runGameNarrationJob } from './narration/game-narration-job.js';
import { createSystemWorker } from './system.worker.js';

const PRESENCE_INTERVAL_MS = 60_000;
const AUTO_ACCEPT_INTERVAL_MS = 10_000;
const QUEUE_INTERVAL_MS = 30_000;
const ANALYSIS_INTERVAL_MS = 30_000;
// Runs less often than the engine analysis it depends on: it's a paid LLM
// call, so there's no benefit to polling as tightly as the free local
// engine job, and most ticks will find nothing new to narrate anyway.
const NARRATION_INTERVAL_MS = 60_000;

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
  runGameNarrationJob(sql).catch((error: unknown) => {
    console.error('worker.narration.game_narration_failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  });
}, NARRATION_INTERVAL_MS);

healthServer.listen(env.WORKER_HEALTH_PORT, '0.0.0.0');

async function shutdown() {
  clearInterval(presenceInterval);
  clearInterval(autoAcceptInterval);
  clearInterval(queueInterval);
  clearInterval(analysisInterval);
  clearInterval(narrationInterval);
  healthServer.close();
  await worker.close();
  await redis.quit();
  await sql.end({ timeout: 5 });
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
