-- Both columns are re-derivable in principle (started_at from the first
-- exercise_attempts row after a stage became available; resolved_exercise_id
-- from re-running the review-selection heuristic) but nothing actually
-- recomputes them today, so this rollback does lose that specific
-- bookkeeping. No other table's data is affected.
ALTER TABLE user_stage_completions
  DROP COLUMN IF EXISTS started_at,
  DROP COLUMN IF EXISTS resolved_exercise_id;
