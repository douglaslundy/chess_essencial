-- Aggregate-only calibration report. Never output user_id, game_id or raw evidence.
\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;

-- report: signal_distribution
SELECT
  rule_version,
  skill_key,
  signal_type,
  COALESCE(evidence->>'detectedTheme', 'none') AS detected_theme,
  evidence->>'quality' AS move_quality,
  count(*) AS signal_count,
  count(DISTINCT user_id) AS affected_user_count,
  round(avg(confidence), 3) AS average_confidence,
  min(created_at)::date AS first_signal_date,
  max(created_at)::date AS last_signal_date
FROM game_error_signals
GROUP BY
  rule_version,
  skill_key,
  signal_type,
  COALESCE(evidence->>'detectedTheme', 'none'),
  evidence->>'quality'
ORDER BY rule_version, skill_key, signal_type, detected_theme, move_quality;

-- report: recommendation_outcomes_by_difficulty
WITH recommendation_outcomes AS (
  SELECT
    recommendation.id,
    recommendation.user_id,
    recommendation.skill_key,
    recommendation.exercise_id,
    CASE
      WHEN exercise.difficulty_score IS NULL
        THEN COALESCE(exercise.difficulty, 'unknown')
      WHEN exercise.difficulty_score < 800 THEN '0000-0799'
      WHEN exercise.difficulty_score < 1050 THEN '0800-1049'
      WHEN exercise.difficulty_score < 1300 THEN '1050-1299'
      WHEN exercise.difficulty_score < 1550 THEN '1300-1549'
      WHEN exercise.difficulty_score < 1800 THEN '1550-1799'
      WHEN exercise.difficulty_score < 2000 THEN '1800-1999'
      ELSE '2000+'
    END AS difficulty_band,
    recommendation.created_at AS recommended_at,
    min(attempt.attempted_at) AS first_attempt_at,
    bool_or(attempt.correct) AS eventually_correct
  FROM learning_recommendations recommendation
  JOIN exercises exercise ON exercise.id = recommendation.exercise_id
  LEFT JOIN exercise_attempts attempt
    ON attempt.user_id = recommendation.user_id
   AND attempt.exercise_id = recommendation.exercise_id
   AND attempt.attempted_at >= recommendation.created_at
   AND attempt.attempted_at < recommendation.created_at + interval '30 days'
  GROUP BY
    recommendation.id,
    recommendation.user_id,
    recommendation.skill_key,
    recommendation.exercise_id,
    exercise.difficulty,
    exercise.difficulty_score
)
SELECT
  skill_key,
  difficulty_band,
  count(*) AS recommendation_count,
  count(DISTINCT user_id) AS reached_user_count,
  count(first_attempt_at) AS attempted_count,
  count(*) FILTER (WHERE eventually_correct) AS eventually_correct_count,
  count(DISTINCT exercise_id) AS distinct_exercises,
  round(count(first_attempt_at)::numeric / NULLIF(count(*), 0), 4) AS attempt_rate,
  round(
    count(*) FILTER (WHERE eventually_correct)::numeric
      / NULLIF(count(first_attempt_at), 0),
    4
  ) AS success_after_attempt_rate,
  round(
    (
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY extract(epoch FROM (first_attempt_at - recommended_at)) / 3600
      ) FILTER (WHERE first_attempt_at IS NOT NULL)
    )::numeric,
    2
  ) AS median_hours_to_attempt
FROM recommendation_outcomes
GROUP BY skill_key, difficulty_band
ORDER BY skill_key, difficulty_band;

-- report: catalog_concentration
WITH exercise_frequency AS (
  SELECT skill_key, exercise_id, count(*) AS recommendation_count
  FROM learning_recommendations
  GROUP BY skill_key, exercise_id
), ranked_frequency AS (
  SELECT
    skill_key,
    recommendation_count,
    row_number() OVER (
      PARTITION BY skill_key
      ORDER BY recommendation_count DESC, exercise_id
    ) AS frequency_rank
  FROM exercise_frequency
), skill_totals AS (
  SELECT
    skill_key,
    sum(recommendation_count) AS total_count,
    count(*) AS distinct_exercises,
    max(recommendation_count) AS top_count,
    sum(recommendation_count) FILTER (WHERE frequency_rank <= 5) AS top_five_count,
    sum(recommendation_count * recommendation_count) AS squared_count_sum
  FROM ranked_frequency
  GROUP BY skill_key
)
SELECT
  skill_key,
  total_count,
  distinct_exercises,
  top_count,
  round(top_count::numeric / NULLIF(total_count, 0), 4) AS top_exercise_share,
  round(top_five_count::numeric / NULLIF(total_count, 0), 4) AS top_five_exercise_share,
  round(
    total_count::numeric * total_count / NULLIF(squared_count_sum, 0),
    2
  ) AS effective_exercise_count
FROM skill_totals
ORDER BY skill_key;

-- report: per_user_repetition
WITH user_practice AS (
  SELECT
    user_id,
    skill_key,
    count(*) AS recommendation_count,
    count(DISTINCT exercise_id) AS distinct_exercises
  FROM learning_recommendations
  GROUP BY user_id, skill_key
)
SELECT
  skill_key,
  count(*) AS reached_user_count,
  sum(recommendation_count) AS recommendation_count,
  round(avg(distinct_exercises), 2) AS average_distinct_exercises_per_user,
  round(
    sum(recommendation_count - distinct_exercises)::numeric
      / NULLIF(sum(recommendation_count), 0),
    4
  ) AS repeated_recommendation_rate,
  round(
    (percentile_cont(0.5) WITHIN GROUP (ORDER BY distinct_exercises))::numeric,
    2
  ) AS median_distinct_exercises_per_user
FROM user_practice
GROUP BY skill_key
ORDER BY skill_key;

ROLLBACK;
