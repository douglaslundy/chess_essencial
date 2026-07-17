import { z } from 'zod';

const optionalSecret = z.string().min(32).optional();
const booleanString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

export const apiEnvSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  AUTH_ACCESS_SECRET: optionalSecret,
  AUTH_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(900),
  AUTH_EXPOSE_VERIFICATION_TOKEN: booleanString,
  AUTH_IP_HASH_SECRET: optionalSecret,
  AUTH_REFRESH_SECRET: optionalSecret,
  AUTH_REFRESH_TTL_SECONDS: z.coerce.number().int().min(3_600).max(7_776_000).default(2_592_000),
  AUTH_VERIFICATION_SECRET: optionalSecret,
  AUTH_VERIFICATION_TTL_SECONDS: z.coerce.number().int().min(300).max(604_800).default(86_400),
  DATABASE_URL: z.string().url().default('postgresql://chess:chess@localhost:5432/chess'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
});

const localSecrets = {
  AUTH_ACCESS_SECRET: 'local-access-secret-change-before-production-2026',
  AUTH_IP_HASH_SECRET: 'local-ip-hash-secret-change-before-production',
  AUTH_REFRESH_SECRET: 'local-refresh-secret-change-before-production',
  AUTH_VERIFICATION_SECRET: 'local-verification-secret-change-before-production',
} as const;

export function validateApiEnv(config: Record<string, unknown>) {
  const parsed = apiEnvSchema.parse(config);
  const secretNames = Object.keys(localSecrets) as (keyof typeof localSecrets)[];

  if (parsed.NODE_ENV === 'production') {
    const missing = secretNames.filter((name) => !parsed[name]);
    if (missing.length > 0) {
      throw new Error('Production authentication secrets are required');
    }
  }

  return {
    ...parsed,
    ...Object.fromEntries(secretNames.map((name) => [name, parsed[name] ?? localSecrets[name]])),
    AUTH_EXPOSE_VERIFICATION_TOKEN:
      parsed.AUTH_EXPOSE_VERIFICATION_TOKEN ?? parsed.NODE_ENV !== 'production',
  };
}
