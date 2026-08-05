-- Aggregate-only calibration report. Never select user_id, game_id or raw evidence.
SELECT
  rule_version,
  skill_key,
  signal_type,
  evidence->>'quality' AS move_quality,
  count(*) AS signal_count,
  round(avg(confidence), 3) AS average_confidence
FROM game_error_signals
GROUP BY rule_version, skill_key, signal_type, evidence->>'quality'
ORDER BY rule_version, skill_key, signal_type, move_quality;

WITH recommendation_outcomes AS (
  SELECT
    recommendation.id,
    recommendation.skill_key,
    recommendation.exercise_id,
    min(attempt.created_at) AS first_attempt_at,
    bool_or(attempt.correct) AS eventually_correct
  FROM learning_recommendations recommendation
  LEFT JOIN exercise_attempts attempt
    ON attempt.user_id = recommendation.user_id
   AND attempt.exercise_id = recommendation.exercise_id
   AND attempt.created_at >= recommendation.created_at
  GROUP BY recommendation.id, recommendation.skill_key, recommendation.exercise_id
)
SELECT
  skill_key,
  count(*) AS recommendation_count,
  count(first_attempt_at) AS attempted_count,
  count(*) FILTER (WHERE eventually_correct) AS eventually_correct_count,
  count(DISTINCT exercise_id) AS distinct_exercises,
  round(count(first_attempt_at)::numeric / NULLIF(count(*), 0), 4) AS attempt_rate,
  round(count(*) FILTER (WHERE eventually_correct)::numeric / NULLIF(count(first_attempt_at), 0), 4) AS success_after_attempt_rate
FROM recommendation_outcomes
GROUP BY skill_key
ORDER BY skill_key;

WITH exercise_frequency AS (
  SELECT skill_key, exercise_id, count(*) AS recommendation_count
  FROM learning_recommendations
  GROUP BY skill_key, exercise_id
), skill_totals AS (
  SELECT skill_key, sum(recommendation_count) AS total_count, max(recommendation_count) AS top_count
  FROM exercise_frequency
  GROUP BY skill_key
)
SELECT
  skill_key,
  total_count,
  top_count,
  round(top_count::numeric / NULLIF(total_count, 0), 4) AS top_exercise_share
FROM skill_totals
ORDER BY skill_key;
