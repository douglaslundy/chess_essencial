DROP TABLE subscription_payments;

ALTER TABLE user_subscriptions
  DROP COLUMN auto_renew,
  DROP COLUMN currency,
  DROP COLUMN billing_period;

ALTER TABLE subscription_plans
  DROP COLUMN annual_price_cents;

DROP INDEX subscription_plans_one_default;

ALTER TABLE subscription_plans
  DROP COLUMN is_default;
