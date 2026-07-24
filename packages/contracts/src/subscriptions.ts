import { z } from 'zod';

// The catalog of resources a plan can gate. Extensible: add an entry here
// whenever a new gate-able feature ships, and the admin plan editor and
// entitlement checks pick it up automatically — no migration required.
// A plan's daily_limit of 0 for an included feature means unlimited; a
// feature absent from a plan's limits is simply not granted by that plan.
export const planFeatureCatalog = [
  { key: 'exercises_per_day', label: 'Exercícios resolvidos por dia' },
  { key: 'games_per_day', label: 'Partidas jogadas por dia' },
  { key: 'lessons_per_day', label: 'Aulas iniciadas por dia' },
] as const;

export const planFeatureKeySchema = z.enum(
  planFeatureCatalog.map((feature) => feature.key) as [string, ...string[]],
);

export const planFeatureLimitSchema = z.object({
  dailyLimit: z.number().int().min(0).max(1_000_000),
  featureKey: planFeatureKeySchema,
});

function uniqueFeatureKeys(limits: { featureKey: string }[]) {
  return new Set(limits.map((limit) => limit.featureKey)).size === limits.length;
}

export const subscriptionPlanSchema = z.object({
  id: z.string().uuid(),
  limits: z.array(planFeatureLimitSchema),
  name: z.string(),
  priceCents: z.number().int().min(0),
  slug: z.string(),
  status: z.enum(['active', 'archived']),
});

export const saveSubscriptionPlanInputSchema = z.object({
  limits: z
    .array(planFeatureLimitSchema)
    .max(planFeatureCatalog.length)
    .refine(uniqueFeatureKeys, 'Cada recurso só pode aparecer uma vez no plano'),
  name: z.string().trim().min(2).max(120),
  priceCents: z.number().int().min(0).max(100_000_00),
});

export const updateSubscriptionPlanStatusInputSchema = z.object({
  status: z.enum(['active', 'archived']),
});

export const subscriptionPlanListSchema = z.object({
  items: z.array(subscriptionPlanSchema),
});

export const userSubscriptionSchema = z.object({
  currentPeriodEnd: z.string().datetime().nullable(),
  plan: subscriptionPlanSchema.nullable(),
  status: z.enum(['active', 'canceled', 'expired']).nullable(),
});

export const planFeatureUsageSchema = z.object({
  allowed: z.boolean(),
  featureKey: planFeatureKeySchema,
  limit: z.number().int().min(0).nullable(),
  used: z.number().int().min(0),
});

export type PlanFeatureKey = z.infer<typeof planFeatureKeySchema>;
export type PlanFeatureLimit = z.infer<typeof planFeatureLimitSchema>;
export type PlanFeatureUsage = z.infer<typeof planFeatureUsageSchema>;
export type SaveSubscriptionPlanInput = z.infer<typeof saveSubscriptionPlanInputSchema>;
export type SubscriptionPlan = z.infer<typeof subscriptionPlanSchema>;
export type SubscriptionPlanList = z.infer<typeof subscriptionPlanListSchema>;
export type UpdateSubscriptionPlanStatusInput = z.infer<
  typeof updateSubscriptionPlanStatusInputSchema
>;
export type UserSubscription = z.infer<typeof userSubscriptionSchema>;
