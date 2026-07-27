import type { Sql } from 'postgres';

/**
 * Mirrors SubscriptionsRepository#expirePastDue (apps/api) — flips
 * subscriptions whose current_period_end has passed to 'expired'. The enum
 * value already existed but nothing wrote it before this job; area 6's
 * default-plan fallback only kicks in once a subscription is no longer
 * 'active', so this is what actually makes an unrenewed subscription's
 * plan stop applying once it's past due.
 *
 * Also logs a matching `subscription_payments` row per expired
 * subscription — the `expired` status was already allowed by the table's
 * CHECK constraint but nothing ever wrote it, leaving the ledger silently
 * incomplete. There's no Mercado Pago provider transaction for this
 * (it's not a webhook, it's this job noticing a deadline passed), so the
 * ledger row is keyed by a synthetic id derived from the subscription and
 * the exact period end it expired against — same idempotent ON CONFLICT
 * shape as the rest of the ledger, while still allowing a new row if the
 * subscription is later reactivated and expires again.
 */
export async function runExpirePastDueJob(sql: Sql): Promise<{ expiredCount: number }> {
  const rows = await sql<{ id: string }[]>`
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
  return { expiredCount: rows.length };
}
