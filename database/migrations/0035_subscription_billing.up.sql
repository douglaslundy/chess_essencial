-- Área 6 (gating): is_default marks the plan applied to users with no paid
-- subscription, replacing the previous "no subscription = unlimited"
-- default (SubscriptionsService#checkEntitlement). Enforced as a single row
-- via the partial unique index, same idiom as user_subscriptions_one_active_per_user.
ALTER TABLE subscription_plans
  ADD COLUMN is_default boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX subscription_plans_one_default
  ON subscription_plans (is_default)
  WHERE is_default = true;

-- Área 7 (billing): monthly price already existed (price_cents); annual is
-- optional per plan (a plan may only offer monthly).
ALTER TABLE subscription_plans
  ADD COLUMN annual_price_cents integer CHECK (annual_price_cents IS NULL OR annual_price_cents >= 0);

ALTER TABLE user_subscriptions
  ADD COLUMN billing_period varchar(10) NOT NULL DEFAULT 'monthly'
    CHECK (billing_period IN ('monthly', 'annual')),
  ADD COLUMN currency varchar(3) NOT NULL DEFAULT 'BRL',
  ADD COLUMN auto_renew boolean NOT NULL DEFAULT true;
-- Existing rows were all monthly Mercado Pago Preapproval subscriptions
-- (genuinely recurring), so the defaults above are also the correct values
-- for data that already existed before this migration — no backfill needed.

-- Financial history: one row per payment event (approved, pending,
-- rejected, cancelled, refunded, expired) — user_subscriptions itself only
-- ever tracks current state, never history.
CREATE TABLE subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES user_subscriptions(id) ON DELETE CASCADE,
  provider varchar(30) NOT NULL DEFAULT 'mercado_pago',
  provider_transaction_id text NOT NULL,
  status varchar(16) NOT NULL
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'refunded', 'expired')),
  amount_cents integer NOT NULL,
  currency varchar(3) NOT NULL DEFAULT 'BRL',
  billing_period varchar(10) NOT NULL CHECK (billing_period IN ('monthly', 'annual')),
  paid_at timestamptz,
  raw_notification jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotency: a re-delivered webhook for the same provider payment never
-- creates a second row.
CREATE UNIQUE INDEX subscription_payments_provider_tx
  ON subscription_payments (provider, provider_transaction_id);

CREATE INDEX subscription_payments_subscription_id
  ON subscription_payments (subscription_id);
