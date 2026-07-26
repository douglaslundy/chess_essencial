import { z } from 'zod';

const mobileEnvSchema = z.object({
  EXPO_PUBLIC_API_URL: z.string().url().default('http://localhost:4000/v1'),
});

export const mobileEnv = mobileEnvSchema.parse({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
});
