-- Remove da projeção agregada somente as evidências de partida criadas
-- por esta migration; sucessos/erros de exercícios permanecem intactos.
WITH totals AS (
  SELECT user_id, skill_key, count(*)::integer AS error_count
  FROM learning_evidence
  WHERE source_type = 'game_error'
  GROUP BY user_id, skill_key
)
UPDATE skill_mastery mastery
SET
  attempts = GREATEST(0, mastery.attempts - totals.error_count),
  error_count = GREATEST(0, mastery.error_count - totals.error_count),
  score = CASE
    WHEN mastery.attempts - totals.error_count <= 0 THEN 0
    ELSE ROUND(
      mastery.success_count::numeric
        / (mastery.attempts - totals.error_count) * 100
    )
  END,
  updated_at = now()
FROM totals
WHERE mastery.user_id = totals.user_id
  AND mastery.skill = totals.skill_key;

DELETE FROM skill_mastery
WHERE attempts = 0
  AND success_count = 0
  AND error_count = 0
  AND skill IN (SELECT skill_key FROM skill_definitions);

DROP TABLE IF EXISTS learning_recommendations;
DROP TABLE IF EXISTS learning_evidence;
DROP TABLE IF EXISTS game_error_signals;
DROP TABLE IF EXISTS skill_tag_aliases;
DROP TABLE IF EXISTS skill_definitions;
