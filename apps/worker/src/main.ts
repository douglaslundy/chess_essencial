import { parseWorkerEnv } from './config/env.js';
import { createHealthServer } from './health-server.js';
import { createSystemWorker } from './system.worker.js';

const env = parseWorkerEnv(process.env);
const worker = createSystemWorker(env.REDIS_URL);
const healthServer = createHealthServer();

worker.on('error', (error) => {
  console.error('worker.connection_error', { message: error.message });
});

worker.on('failed', (job, error) => {
  console.error('worker.job_failed', { jobId: job?.id, message: error.message });
});

healthServer.listen(env.WORKER_HEALTH_PORT, '0.0.0.0');

async function shutdown() {
  healthServer.close();
  await worker.close();
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
