import { z } from 'zod';

export const workerEnvSchema = z.object({
  DATABASE_URL: z.string().url().default('postgresql://postgres:postgres@localhost:5432/xadrez'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  // Must match apps/api/src/config/env.ts's SETTINGS_ENCRYPTION_KEY exactly
  // — the worker only ever decrypts a key an admin encrypted via the API.
  SETTINGS_ENCRYPTION_KEY: z
    .string()
    .min(32)
    .default('local-settings-encryption-key-change-before-production'),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65_535).default(4001),
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function parseWorkerEnv(env: NodeJS.ProcessEnv): WorkerEnv {
  return workerEnvSchema.parse(env);
}
