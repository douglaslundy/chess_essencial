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
  { key: 'hints_per_day', label: 'Dicas de exercícios por dia' },
  { key: 'ai_narrations_per_day', label: 'Narrações por IA da revisão pós-partida por dia' },
  { key: 'game_analysis_access', label: 'Revisão pós-partida com o motor (Stockfish)' },
  { key: 'coach_mode_access', label: 'Modo Treinador (dicas em tempo real)' },
  { key: 'social_access', label: 'Rede social (feed, amigos, mensagens diretas, ranking)' },
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
  annualPriceCents: z.number().int().min(0).nullable(),
  id: z.string().uuid(),
  isDefault: z.boolean(),
  limits: z.array(planFeatureLimitSchema),
  name: z.string(),
  priceCents: z.number().int().min(0),
  slug: z.string(),
  status: z.enum(['active', 'archived']),
});

export const saveSubscriptionPlanInputSchema = z.object({
  // Omitted/null: this plan offers monthly only.
  annualPriceCents: z.number().int().min(0).max(100_000_00).nullable().optional(),
  // At most one plan may be the default (fallback for users with no paid
  // subscription) — enforced by a partial unique index in the database too,
  // not just here.
  isDefault: z.boolean().optional(),
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

export const billingPeriodSchema = z.enum(['monthly', 'annual']);

export const userSubscriptionSchema = z.object({
  autoRenew: z.boolean().nullable(),
  billingPeriod: billingPeriodSchema.nullable(),
  currentPeriodEnd: z.string().datetime().nullable(),
  plan: subscriptionPlanSchema.nullable(),
  status: z.enum(['active', 'canceled', 'expired']).nullable(),
});

export const subscriptionPaymentSchema = z.object({
  amountCents: z.number().int(),
  billingPeriod: billingPeriodSchema,
  currency: z.string(),
  id: z.string().uuid(),
  paidAt: z.string().datetime().nullable(),
  provider: z.string(),
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled', 'refunded', 'expired']),
});

export const subscriptionPaymentListSchema = z.object({
  items: z.array(subscriptionPaymentSchema),
});

export const planFeatureUsageSchema = z.object({
  allowed: z.boolean(),
  featureKey: planFeatureKeySchema,
  limit: z.number().int().min(0).nullable(),
  used: z.number().int().min(0),
});

export const createCheckoutInputSchema = z.object({
  billingPeriod: billingPeriodSchema.default('monthly'),
  planId: z.string().uuid(),
});

export const checkoutResultSchema = z.object({
  checkoutUrl: z.string().url(),
});

export type BillingPeriod = z.infer<typeof billingPeriodSchema>;
export type CheckoutResult = z.infer<typeof checkoutResultSchema>;
export type CreateCheckoutInput = z.infer<typeof createCheckoutInputSchema>;
export type PlanFeatureKey = z.infer<typeof planFeatureKeySchema>;
export type PlanFeatureLimit = z.infer<typeof planFeatureLimitSchema>;
export type PlanFeatureUsage = z.infer<typeof planFeatureUsageSchema>;
export type SaveSubscriptionPlanInput = z.infer<typeof saveSubscriptionPlanInputSchema>;
export type SubscriptionPayment = z.infer<typeof subscriptionPaymentSchema>;
export type SubscriptionPaymentList = z.infer<typeof subscriptionPaymentListSchema>;
export type SubscriptionPlan = z.infer<typeof subscriptionPlanSchema>;
export type SubscriptionPlanList = z.infer<typeof subscriptionPlanListSchema>;
export type UpdateSubscriptionPlanStatusInput = z.infer<
  typeof updateSubscriptionPlanStatusInputSchema
>;
export type UserSubscription = z.infer<typeof userSubscriptionSchema>;
