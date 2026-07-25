import type { PlanFeatureKey, SaveSubscriptionPlanInput } from '@xadrez/contracts';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Sql, TransactionSql } from 'postgres';

import { DatabaseService } from '../database/database.service.js';

interface PlanRow {
  id: string;
  name: string;
  priceCents: number;
  slug: string;
  status: 'active' | 'archived';
}
interface PlanLimitRow {
  dailyLimit: number;
  featureKey: string;
  planId: string;
}
export interface PlanWithLimits extends PlanRow {
  limits: { dailyLimit: number; featureKey: string }[];
}

const COMBINING_DIACRITICS = /[̀-ͯ]/g;

function slugify(name: string) {
  const base = name
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
    .slice(0, 60);
  return base.length > 0 ? base : 'plano';
}

@Injectable()
export class SubscriptionsRepository {
  constructor(private readonly database: DatabaseService) {}

  private async withLimits(plans: PlanRow[]): Promise<PlanWithLimits[]> {
    if (plans.length === 0) return [];
    const ids = this.database.client.array(plans.map((plan) => plan.id));
    const limits = await this.database.client<PlanLimitRow[]>`
      SELECT plan_id AS "planId", feature_key AS "featureKey", daily_limit AS "dailyLimit"
        FROM subscription_plan_limits WHERE plan_id = ANY(${ids}::uuid[])
    `;
    return plans.map((plan) => ({
      ...plan,
      limits: limits
        .filter((limit) => limit.planId === plan.id)
        .map((limit) => ({ dailyLimit: limit.dailyLimit, featureKey: limit.featureKey })),
    }));
  }

  async listPlans(): Promise<PlanWithLimits[]> {
    const plans = await this.database.client<PlanRow[]>`
      SELECT id, name, slug, status, price_cents AS "priceCents"
        FROM subscription_plans ORDER BY created_at
    `;
    return this.withLimits(plans);
  }

  /** Public-facing catalog for the checkout page — active plans only. */
  async listActivePlans(): Promise<PlanWithLimits[]> {
    const plans = await this.database.client<PlanRow[]>`
      SELECT id, name, slug, status, price_cents AS "priceCents"
        FROM subscription_plans WHERE status = 'active' ORDER BY price_cents
    `;
    return this.withLimits(plans);
  }

  async getPlanById(planId: string): Promise<PlanWithLimits | null> {
    const [plan] = await this.database.client<PlanRow[]>`
      SELECT id, name, slug, status, price_cents AS "priceCents"
        FROM subscription_plans WHERE id = ${planId}
    `;
    if (!plan) return null;
    const [withLimits] = await this.withLimits([plan]);
    return withLimits!;
  }

  private async uniqueSlug(name: string, transaction: Sql | TransactionSql = this.database.client) {
    const base = slugify(name);
    let candidate = base;
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const [existing] = await transaction<{ id: string }[]>`
        SELECT id FROM subscription_plans WHERE slug = ${candidate}
      `;
      if (!existing) return candidate;
      candidate = `${base}-${attempt + 1}`;
    }
    return `${base}-${Date.now()}`;
  }

  async createPlan(input: SaveSubscriptionPlanInput): Promise<PlanWithLimits> {
    return this.database.client.begin(async (transaction) => {
      const slug = await this.uniqueSlug(input.name, transaction);
      const [plan] = await transaction<PlanRow[]>`
        INSERT INTO subscription_plans (name, slug, price_cents)
        VALUES (${input.name}, ${slug}, ${input.priceCents})
        RETURNING id, name, slug, status, price_cents AS "priceCents"
      `;
      if (!plan) throw new Error('Plano não foi criado');
      for (const limit of input.limits)
        await transaction`
          INSERT INTO subscription_plan_limits (plan_id, feature_key, daily_limit)
          VALUES (${plan.id}, ${limit.featureKey}, ${limit.dailyLimit})
        `;
      return { ...plan, limits: input.limits };
    });
  }

  async updatePlan(planId: string, input: SaveSubscriptionPlanInput): Promise<PlanWithLimits> {
    return this.database.client.begin(async (transaction) => {
      const [plan] = await transaction<PlanRow[]>`
        UPDATE subscription_plans SET name = ${input.name}, price_cents = ${input.priceCents},
          updated_at = now()
        WHERE id = ${planId}
        RETURNING id, name, slug, status, price_cents AS "priceCents"
      `;
      if (!plan) throw new NotFoundException('Plano não encontrado');
      await transaction`DELETE FROM subscription_plan_limits WHERE plan_id = ${planId}`;
      for (const limit of input.limits)
        await transaction`
          INSERT INTO subscription_plan_limits (plan_id, feature_key, daily_limit)
          VALUES (${planId}, ${limit.featureKey}, ${limit.dailyLimit})
        `;
      return { ...plan, limits: input.limits };
    });
  }

  async updatePlanStatus(planId: string, status: 'active' | 'archived'): Promise<PlanWithLimits> {
    const [plan] = await this.database.client<PlanRow[]>`
      UPDATE subscription_plans SET status = ${status}, updated_at = now()
      WHERE id = ${planId}
      RETURNING id, name, slug, status, price_cents AS "priceCents"
    `;
    if (!plan) throw new NotFoundException('Plano não encontrado');
    const [withLimits] = await this.withLimits([plan]);
    return withLimits!;
  }

  async getActiveSubscriptionForUser(
    userId: string,
  ): Promise<{ currentPeriodEnd: Date | null; plan: PlanWithLimits; status: string } | null> {
    const [row] = await this.database.client<
      { currentPeriodEnd: Date | null; planId: string; status: string }[]
    >`
      SELECT plan_id AS "planId", status, current_period_end AS "currentPeriodEnd"
        FROM user_subscriptions WHERE user_id = ${userId} AND status = 'active'
    `;
    if (!row) return null;
    const plan = await this.getPlanById(row.planId);
    if (!plan) return null;
    return { currentPeriodEnd: row.currentPeriodEnd, plan, status: row.status };
  }

  /**
   * Grants `planId` to `userId` for `days`, but only if they have no active
   * subscription already — a promotional reward (e.g. referrals) must never
   * downgrade or otherwise disturb an existing paid plan.
   */
  async grantTemporaryPlanIfNone(userId: string, planId: string, days: number): Promise<void> {
    if (days <= 0) return;
    await this.database.client`
      INSERT INTO user_subscriptions (user_id, plan_id, status, current_period_end)
      VALUES (${userId}, ${planId}, 'active', now() + make_interval(days => ${days}))
      ON CONFLICT (user_id) WHERE status = 'active' DO NOTHING
    `;
  }

  /**
   * Starts a checkout: creates a 'pending' row (the row's own id becomes the
   * Mercado Pago `external_reference`) so the webhook can find it later.
   * Any previous pending row for this user is discarded first — only the
   * most recent checkout attempt matters.
   */
  async createPendingSubscription(userId: string, planId: string): Promise<string> {
    return this.database.client.begin(async (transaction) => {
      await transaction`
        DELETE FROM user_subscriptions WHERE user_id = ${userId} AND status = 'pending'
      `;
      const [row] = await transaction<{ id: string }[]>`
        INSERT INTO user_subscriptions (user_id, plan_id, status)
        VALUES (${userId}, ${planId}, 'pending')
        RETURNING id
      `;
      if (!row) throw new Error('Assinatura pendente não foi criada');
      return row.id;
    });
  }

  async attachMercadoPagoId(subscriptionId: string, mercadoPagoSubscriptionId: string) {
    await this.database.client`
      UPDATE user_subscriptions SET mercado_pago_subscription_id = ${mercadoPagoSubscriptionId},
        updated_at = now()
      WHERE id = ${subscriptionId}
    `;
  }

  /** Called by the webhook once Mercado Pago confirms the preapproval. */
  async activateSubscription(
    externalReference: string,
    mercadoPagoSubscriptionId: string,
    currentPeriodEnd: Date | null,
  ): Promise<{ planId: string; userId: string } | null> {
    return this.database.client.begin(async (transaction) => {
      const [pending] = await transaction<{ planId: string; userId: string }[]>`
        SELECT user_id AS "userId", plan_id AS "planId" FROM user_subscriptions
         WHERE id = ${externalReference} AND status = 'pending'
         FOR UPDATE
      `;
      if (!pending) return null;
      await transaction`
        UPDATE user_subscriptions s SET status = 'canceled', updated_at = now()
         WHERE s.user_id = ${pending.userId} AND s.status = 'active'
      `;
      await transaction`
        UPDATE user_subscriptions SET status = 'active',
          mercado_pago_subscription_id = ${mercadoPagoSubscriptionId},
          current_period_end = ${currentPeriodEnd}, updated_at = now()
         WHERE id = ${externalReference}
      `;
      return pending;
    });
  }

  async cancelSubscriptionByMercadoPagoId(mercadoPagoSubscriptionId: string): Promise<void> {
    await this.database.client`
      UPDATE user_subscriptions SET status = 'canceled', updated_at = now()
       WHERE mercado_pago_subscription_id = ${mercadoPagoSubscriptionId} AND status = 'active'
    `;
  }

  /**
   * Count of today's usage (UTC calendar day) for a gated feature. Reuses
   * existing tables — exercise/lesson/game attempts already carry a
   * timestamp and user link — instead of maintaining a separate counter
   * table that could drift out of sync.
   */
  async usageToday(userId: string, featureKey: PlanFeatureKey): Promise<number> {
    const sql = this.database.client;
    if (featureKey === 'exercises_per_day') {
      const [row] = await sql<{ count: number }[]>`
        SELECT count(DISTINCT exercise_id)::integer AS count FROM exercise_attempts
         WHERE user_id = ${userId} AND correct = true
           AND attempted_at >= date_trunc('day', now())
           AND attempted_at < date_trunc('day', now()) + interval '1 day'
      `;
      return row?.count ?? 0;
    }
    if (featureKey === 'lessons_per_day') {
      const [row] = await sql<{ count: number }[]>`
        SELECT count(*)::integer AS count FROM lesson_attempts
         WHERE user_id = ${userId}
           AND started_at >= date_trunc('day', now())
           AND started_at < date_trunc('day', now()) + interval '1 day'
      `;
      return row?.count ?? 0;
    }
    // games_per_day
    const [row] = await sql<{ count: number }[]>`
      SELECT count(*)::integer AS count FROM games g
        JOIN game_players gp ON gp.game_id = g.id
       WHERE gp.user_id = ${userId}
         AND g.created_at >= date_trunc('day', now())
         AND g.created_at < date_trunc('day', now()) + interval '1 day'
    `;
    return row?.count ?? 0;
  }
}
