import { z } from 'zod';

export const healthStatusSchema = z.object({
  service: z.enum(['api', 'web', 'worker']),
  status: z.literal('ok'),
  timestamp: z.iso.datetime(),
});

export type HealthStatus = z.infer<typeof healthStatusSchema>;
