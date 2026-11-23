DELETE FROM subscription_plans
WHERE slug IN ('basico', 'familia')
  AND NOT EXISTS (SELECT 1 FROM user_subscriptions s WHERE s.plan_id = subscription_plans.id);
