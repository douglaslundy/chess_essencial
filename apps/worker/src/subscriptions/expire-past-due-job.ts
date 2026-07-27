import type { Sql } from 'postgres';

/**
 * Mirrors SubscriptionsRepository#expirePastDue (apps/api) — flips
 * subscriptions whose current_period_end has passed to 'expired'. The enum
 * value already existed but nothing wrote it before this job; area 6's
 * default-plan fallback only kicks in once a subscription is no longer
 * 'active', so this is what actually makes an unrenewed subscription's
 * plan stop applying once it's past due.
 */
export async function runExpirePastDueJob(sql: Sql): Promise<{ expiredCount: number }> {
  const rows = await sql<{ id: string }[]>`
    UPDATE user_subscriptions SET status = 'expired', updated_at = now()
    WHERE status = 'active' AND current_period_end IS NOT NULL AND current_period_end < now()
    RETURNING id
  `;
  return { expiredCount: rows.length };
}
