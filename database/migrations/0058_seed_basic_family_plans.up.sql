-- Planos pagos iniciais: Básico (R$ 19,90) e Família (6 pessoas, R$ 79,90).
-- Só entram se ainda não existir plano com o mesmo slug ou o mesmo preço mensal;
-- o plano Free (is_default) e quaisquer planos criados pelo admin não são tocados.
WITH novos(name, slug, price_cents) AS (
  VALUES
    ('Básico', 'basico', 1990),
    ('Família (até 6 pessoas)', 'familia', 7990)
), inseridos AS (
  INSERT INTO subscription_plans (name, slug, price_cents)
  SELECT n.name, n.slug, n.price_cents
  FROM novos n
  WHERE NOT EXISTS (
    SELECT 1 FROM subscription_plans p
    WHERE p.slug = n.slug OR (p.status = 'active' AND p.price_cents = n.price_cents)
  )
  RETURNING id
)
INSERT INTO subscription_plan_limits (plan_id, feature_key, daily_limit)
SELECT i.id, l.feature_key, l.daily_limit
FROM inseridos i
CROSS JOIN (
  VALUES
    ('exercises_per_day', 0),
    ('games_per_day', 0),
    ('lessons_per_day', 0),
    ('hints_per_day', 0),
    ('ai_narrations_per_day', 10),
    ('game_analysis_access', 0),
    ('coach_mode_access', 0),
    ('social_access', 0)
) AS l(feature_key, daily_limit);
