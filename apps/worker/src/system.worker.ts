import { Worker } from 'bullmq';

export function createSystemWorker(redisUrl: string) {
  const url = new URL(redisUrl);
  const connection = {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.password ? { password: url.password } : {}),
  };

  return new Worker(
    'system',
    async (job) => ({
      completedAt: new Date().toISOString(),
      jobId: job.id,
    }),
    { connection },
  );
}
