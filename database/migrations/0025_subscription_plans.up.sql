CREATE TABLE subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  slug varchar(80) UNIQUE NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  price_cents integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One row per feature a plan actually grants access to. feature_key is a
-- free-form identifier validated in application code against an
-- extensible catalog (packages/contracts/src/subscriptions.ts), so new
-- gate-able features never require a migration to add. A feature with NO
-- row for a given plan is simply not available on that plan; daily_limit
-- of 0 means unlimited for a feature that IS included.
CREATE TABLE subscription_plan_limits (
  plan_id uuid NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
  feature_key varchar(60) NOT NULL,
  daily_limit integer NOT NULL DEFAULT 0 CHECK (daily_limit >= 0),
  PRIMARY KEY (plan_id, feature_key)
);

CREATE TABLE user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES subscription_plans(id),
  status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'expired')),
  mercado_pago_subscription_id text,
  started_at timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- A user has at most one active subscription at a time.
CREATE UNIQUE INDEX user_subscriptions_one_active_per_user
  ON user_subscriptions (user_id) WHERE status = 'active';
CREATE INDEX user_subscriptions_mp_id
  ON user_subscriptions (mercado_pago_subscription_id)
  WHERE mercado_pago_subscription_id IS NOT NULL;
