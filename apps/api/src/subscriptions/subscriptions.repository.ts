import type { BillingPeriod, PlanFeatureKey, SaveSubscriptionPlanInput } from '@xadrez/contracts';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Sql, TransactionSql } from 'postgres';

import { DatabaseService } from '../database/database.service.js';

// Composable fragment (porsager/postgres): a tagged-template `sql` call
// spliced into another `sql` call is inlined as real SQL, not bound as a
// parameter value — this must stay a `sql\`...\`` call, not a plain string.
function planColumns(sql: Sql | TransactionSql) {
  return sql`id, name, slug, status, price_cents AS "priceCents",
    annual_price_cents AS "annualPriceCents", is_default AS "isDefault"`;
}

interface PlanRow {
  annualPriceCents: number | null;
  id: string;
  isDefault: boolean;
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

export type SubscriptionPaymentStatus =
  'pending' | 'approved' | 'rejected' | 'cancelled' | 'refunded' | 'expired';

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

// porsager/postgres has no native binder for "arbitrary unknown value as
// jsonb" — same `${...}::text::jsonb` idiom already used elsewhere in the
// codebase (see courses/lesson-importer.ts) for the webhook's raw payload,
// kept for audit/debugging (subscription_payments.raw_notification).
function toJsonb(value: unknown): string {
  return JSON.stringify(value ?? null);
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
      SELECT ${planColumns(this.database.client)}
        FROM subscription_plans ORDER BY created_at
    `;
    return this.withLimits(plans);
  }

  /** Public-facing catalog for the checkout page — active plans only. */
  async listActivePlans(): Promise<PlanWithLimits[]> {
    const plans = await this.database.client<PlanRow[]>`
      SELECT ${planColumns(this.database.client)}
        FROM subscription_plans WHERE status = 'active' ORDER BY price_cents
    `;
    return this.withLimits(plans);
  }

  async getPlanById(planId: string): Promise<PlanWithLimits | null> {
    const [plan] = await this.database.client<PlanRow[]>`
      SELECT ${planColumns(this.database.client)}
        FROM subscription_plans WHERE id = ${planId}
    `;
    if (!plan) return null;
    const [withLimits] = await this.withLimits([plan]);
    return withLimits!;
  }

  /** Same query AdminGuard uses to gate the admin panel itself — reused here so checkEntitlement() can bypass plan limits for admins without duplicating this check at every call site. */
  async isAdmin(userId: string): Promise<boolean> {
    const [role] = await this.database.client<{ allowed: boolean }[]>`
      SELECT true AS allowed FROM user_roles WHERE user_id = ${userId} AND role = 'admin'
    `;
    return role !== undefined;
  }

  /** Fallback plan for users with no active paid subscription (área 6 gating). */
  async getDefaultPlan(): Promise<PlanWithLimits | null> {
    const [plan] = await this.database.client<PlanRow[]>`
      SELECT ${planColumns(this.database.client)}
        FROM subscription_plans WHERE is_default = true
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

  /** Clears any other plan's is_default flag — must run inside the same transaction as the set. */
  private async clearOtherDefaults(transaction: TransactionSql, exceptPlanId: string | null) {
    await transaction`
      UPDATE subscription_plans SET is_default = false, updated_at = now()
      WHERE is_default = true ${exceptPlanId ? transaction`AND id != ${exceptPlanId}` : transaction``}
    `;
  }

  async createPlan(input: SaveSubscriptionPlanInput): Promise<PlanWithLimits> {
    return this.database.client.begin(async (transaction) => {
      const slug = await this.uniqueSlug(input.name, transaction);
      if (input.isDefault) await this.clearOtherDefaults(transaction, null);
      const [plan] = await transaction<PlanRow[]>`
        INSERT INTO subscription_plans (name, slug, price_cents, annual_price_cents, is_default)
        VALUES (
          ${input.name}, ${slug}, ${input.priceCents}, ${input.annualPriceCents ?? null},
          ${input.isDefault ?? false}
        )
        RETURNING ${planColumns(transaction)}
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
      if (input.isDefault) await this.clearOtherDefaults(transaction, planId);
      const [plan] = await transaction<PlanRow[]>`
        UPDATE subscription_plans SET name = ${input.name}, price_cents = ${input.priceCents},
          annual_price_cents = ${input.annualPriceCents ?? null},
          is_default = ${input.isDefault ?? false},
          updated_at = now()
        WHERE id = ${planId}
        RETURNING ${planColumns(transaction)}
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
      RETURNING ${planColumns(this.database.client)}
    `;
    if (!plan) throw new NotFoundException('Plano não encontrado');
    const [withLimits] = await this.withLimits([plan]);
    return withLimits!;
  }

  async getActiveSubscriptionForUser(userId: string): Promise<{
    autoRenew: boolean;
    billingPeriod: BillingPeriod;
    currentPeriodEnd: Date | null;
    plan: PlanWithLimits;
    status: string;
  } | null> {
    const [row] = await this.database.client<
      {
        autoRenew: boolean;
        billingPeriod: BillingPeriod;
        currentPeriodEnd: Date | null;
        planId: string;
        status: string;
      }[]
    >`
      SELECT plan_id AS "planId", status, current_period_end AS "currentPeriodEnd",
        billing_period AS "billingPeriod", auto_renew AS "autoRenew"
        FROM user_subscriptions WHERE user_id = ${userId} AND status = 'active'
    `;
    if (!row) return null;
    const plan = await this.getPlanById(row.planId);
    if (!plan) return null;
    return {
      autoRenew: row.autoRenew,
      billingPeriod: row.billingPeriod,
      currentPeriodEnd: row.currentPeriodEnd,
      plan,
      status: row.status,
    };
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
   * Admin override (apps/api/src/admin) — sets a user's plan directly with
   * no expiry and no Mercado Pago involvement, e.g. support/comp cases.
   * `planId: null` just cancels the current active subscription, if any.
   */
  async adminSetPlan(userId: string, planId: string | null): Promise<void> {
    await this.database.client.begin(async (transaction) => {
      await transaction`
        UPDATE user_subscriptions SET status = 'canceled', updated_at = now()
         WHERE user_id = ${userId} AND status = 'active'
      `;
      if (!planId) return;
      await transaction`
        INSERT INTO user_subscriptions (user_id, plan_id, status, current_period_end)
        VALUES (${userId}, ${planId}, 'active', NULL)
      `;
    });
  }

  /**
   * Starts a checkout: creates a 'pending' row (the row's own id becomes the
   * Mercado Pago `external_reference`) so the webhook can find it later.
   * Any previous pending row for this user is discarded first — only the
   * most recent checkout attempt matters.
   */
  async createPendingSubscription(
    userId: string,
    planId: string,
    billingPeriod: BillingPeriod,
  ): Promise<string> {
    return this.database.client.begin(async (transaction) => {
      await transaction`
        DELETE FROM user_subscriptions WHERE user_id = ${userId} AND status = 'pending'
      `;
      const [row] = await transaction<{ id: string }[]>`
        INSERT INTO user_subscriptions (user_id, plan_id, status, billing_period, auto_renew)
        VALUES (${userId}, ${planId}, 'pending', ${billingPeriod}, ${billingPeriod === 'monthly'})
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

  /** Called by the webhook once Mercado Pago confirms the preapproval (monthly, recurring). */
  async activateSubscription(
    externalReference: string,
    mercadoPagoSubscriptionId: string,
    currentPeriodEnd: Date | null,
    amountCents: number,
    rawNotification: unknown,
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
      await transaction`
        INSERT INTO subscription_payments
          (subscription_id, provider_transaction_id, status, amount_cents, billing_period, paid_at, raw_notification)
        VALUES (${externalReference}, ${mercadoPagoSubscriptionId}, 'approved', ${amountCents}, 'monthly', now(),
          ${toJsonb(rawNotification)}::text::jsonb)
        ON CONFLICT (provider, provider_transaction_id) DO NOTHING
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
   * Called by the webhook for a one-time annual payment (Mercado Pago
   * Payment API, not Preapproval — no recurring/auto-charge). Same
   * "cancel prior active, then activate the pending row" shape as
   * activateSubscription, just with a fixed 1-year expiry instead of
   * whatever Mercado Pago's Preapproval reports.
   */
  async activateOneTimePayment(
    externalReference: string,
    providerTransactionId: string,
    amountCents: number,
    rawNotification: unknown,
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
          current_period_end = now() + interval '1 year', updated_at = now()
         WHERE id = ${externalReference}
      `;
      await transaction`
        INSERT INTO subscription_payments
          (subscription_id, provider_transaction_id, status, amount_cents, billing_period, paid_at, raw_notification)
        VALUES (${externalReference}, ${providerTransactionId}, 'approved', ${amountCents}, 'annual', now(),
          ${toJsonb(rawNotification)}::text::jsonb)
        ON CONFLICT (provider, provider_transaction_id) DO NOTHING
      `;
      return pending;
    });
  }

  /**
   * Records a Mercado Pago recurring charge (`type=payment` webhook) for a
   * subscription that is already `active` — i.e. every renewal after the
   * first. `activateOneTimePayment` only matches a still-`pending` row (the
   * initial charge); once the local subscription has transitioned to
   * `active`, that lookup finds nothing and a renewal payment used to
   * vanish silently — never logged in the ledger, `current_period_end`
   * never pushed out. Idempotent the same way as the rest of the ledger
   * (ON CONFLICT on provider+provider_transaction_id); the period is only
   * extended when the ledger insert actually happened, so a re-delivered
   * webhook can't push `current_period_end` out twice. Returns whether a
   * renewal was actually recorded (false when there's no matching active
   * subscription — e.g. an unrelated/unknown payment id).
   */
  async recordRecurringRenewal(
    externalReference: string,
    providerTransactionId: string,
    amountCents: number,
    rawNotification: unknown,
  ): Promise<boolean> {
    return this.database.client.begin(async (transaction) => {
      const [subscription] = await transaction<{ billingPeriod: BillingPeriod }[]>`
        SELECT billing_period AS "billingPeriod" FROM user_subscriptions
         WHERE id = ${externalReference} AND status = 'active'
         FOR UPDATE
      `;
      if (!subscription) return false;
      const [inserted] = await transaction<{ id: string }[]>`
        INSERT INTO subscription_payments
          (subscription_id, provider_transaction_id, status, amount_cents, billing_period, paid_at, raw_notification)
        VALUES (${externalReference}, ${providerTransactionId}, 'approved', ${amountCents},
          ${subscription.billingPeriod}, now(), ${toJsonb(rawNotification)}::text::jsonb)
        ON CONFLICT (provider, provider_transaction_id) DO NOTHING
        RETURNING id
      `;
      if (!inserted) return false;
      const period =
        subscription.billingPeriod === 'annual'
          ? transaction`interval '1 year'`
          : transaction`interval '1 month'`;
      await transaction`
        UPDATE user_subscriptions
           SET current_period_end = COALESCE(current_period_end, now()) + ${period}, updated_at = now()
         WHERE id = ${externalReference}
      `;
      return true;
    });
  }

  /**
   * Records any non-approving payment event (pending/in_process while
   * awaiting confirmation, rejected, cancelled) in the ledger without
   * activating anything. Idempotent upsert — a later notification for the
   * same payment id updates the same row instead of duplicating it.
   */
  async recordOneTimePaymentEvent(
    externalReference: string,
    providerTransactionId: string,
    status: Exclude<SubscriptionPaymentStatus, 'approved' | 'refunded'>,
    amountCents: number,
    rawNotification: unknown,
  ): Promise<void> {
    await this.database.client`
      INSERT INTO subscription_payments
        (subscription_id, provider_transaction_id, status, amount_cents, billing_period, raw_notification)
      VALUES (${externalReference}, ${providerTransactionId}, ${status}, ${amountCents}, 'annual',
        ${toJsonb(rawNotification)}::text::jsonb)
      ON CONFLICT (provider, provider_transaction_id) DO UPDATE
        SET status = EXCLUDED.status, raw_notification = EXCLUDED.raw_notification
    `;
  }

  /**
   * A previously approved one-time payment was refunded/charged back —
   * marks the ledger row accordingly and cancels the subscription it paid
   * for (the money was returned, so the access it bought should end too).
   */
  async refundOneTimePayment(
    externalReference: string,
    providerTransactionId: string,
    amountCents: number,
    rawNotification: unknown,
  ): Promise<void> {
    await this.database.client.begin(async (transaction) => {
      await transaction`
        INSERT INTO subscription_payments
          (subscription_id, provider_transaction_id, status, amount_cents, billing_period, raw_notification)
        VALUES (${externalReference}, ${providerTransactionId}, 'refunded', ${amountCents}, 'annual',
          ${toJsonb(rawNotification)}::text::jsonb)
        ON CONFLICT (provider, provider_transaction_id) DO UPDATE
          SET status = 'refunded', raw_notification = EXCLUDED.raw_notification
      `;
      await transaction`
        UPDATE user_subscriptions SET status = 'canceled', updated_at = now()
        WHERE id = ${externalReference} AND status = 'active'
      `;
    });
  }

  async listPaymentsForUser(userId: string): Promise<
    {
      amountCents: number;
      billingPeriod: BillingPeriod;
      currency: string;
      id: string;
      paidAt: Date | null;
      provider: string;
      status: SubscriptionPaymentStatus;
    }[]
  > {
    return this.database.client`
      SELECT p.id, p.provider, p.status, p.amount_cents AS "amountCents", p.currency,
        p.billing_period AS "billingPeriod", p.paid_at AS "paidAt"
      FROM subscription_payments p
      JOIN user_subscriptions s ON s.id = p.subscription_id
      WHERE s.user_id = ${userId}
      ORDER BY p.created_at DESC
    `;
  }

  /**
   * Flips subscriptions past their expiry to 'expired' — the enum value
   * existed but nothing wrote it until now. Also logs a matching
   * `subscription_payments` row for each one: the `expired` status was
   * already allowed by the table's CHECK constraint but nothing ever wrote
   * it, leaving the ledger silently incomplete. Not a Mercado Pago
   * notification — there's no provider transaction id — so the ledger row
   * is keyed by a synthetic id derived from the subscription and the exact
   * period end it expired against, which keeps the same idempotent
   * ON CONFLICT shape as the rest of the ledger while still allowing a new
   * row if the same subscription is reactivated and expires again later.
   */
  async expirePastDue(): Promise<number> {
    const rows = await this.database.client<{ id: string }[]>`
      WITH expired AS (
        UPDATE user_subscriptions SET status = 'expired', updated_at = now()
        WHERE status = 'active' AND current_period_end IS NOT NULL AND current_period_end < now()
        RETURNING id, billing_period, current_period_end
      ), logged AS (
        INSERT INTO subscription_payments
          (subscription_id, provider_transaction_id, status, amount_cents, billing_period, raw_notification)
        SELECT
          expired.id,
          'expired:' || expired.id::text || ':' || expired.current_period_end::text,
          'expired',
          0,
          expired.billing_period,
          jsonb_build_object(
            'reason', 'current_period_end_passed',
            'subscriptionId', expired.id,
            'currentPeriodEnd', expired.current_period_end
          )
        FROM expired
        ON CONFLICT (provider, provider_transaction_id) DO NOTHING
      )
      SELECT id FROM expired
    `;
    return rows.length;
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
    if (featureKey === 'games_per_day') {
      const [row] = await sql<{ count: number }[]>`
        SELECT count(*)::integer AS count FROM games g
          JOIN game_players gp ON gp.game_id = g.id
         WHERE gp.user_id = ${userId}
           AND g.created_at >= date_trunc('day', now())
           AND g.created_at < date_trunc('day', now()) + interval '1 day'
      `;
      return row?.count ?? 0;
    }
    if (featureKey === 'hints_per_day') {
      // No per-hint timestamp exists (hints_used is a running counter on the
      // training item) — approximated by the session's start time, same
      // day-bucketing precision already used for lessons_per_day.
      const [row] = await sql<{ count: number }[]>`
        SELECT COALESCE(SUM(i.hints_used), 0)::integer AS count
        FROM exercise_training_items i
        JOIN exercise_training_sessions s ON s.id = i.session_id
       WHERE s.user_id = ${userId}
         AND s.created_at >= date_trunc('day', now())
         AND s.created_at < date_trunc('day', now()) + interval '1 day'
      `;
      return row?.count ?? 0;
    }
    if (featureKey === 'ai_narrations_per_day') {
      const [row] = await sql<{ count: number }[]>`
        SELECT count(DISTINCT gn.game_id)::integer AS count
        FROM game_narrations gn
        JOIN game_players gp ON gp.game_id = gn.game_id
       WHERE gp.user_id = ${userId} AND gn.status = 'completed'
         AND gn.completed_at >= date_trunc('day', now())
         AND gn.completed_at < date_trunc('day', now()) + interval '1 day'
      `;
      return row?.count ?? 0;
    }
    // Boolean-access features (game_analysis_access, coach_mode_access,
    // social_access) never reach here in practice — checkEntitlement only
    // calls usageToday when a plan's dailyLimit for the feature is nonzero,
    // and those are meant to be granted with dailyLimit 0 (unlimited).
    return 0;
  }
}
