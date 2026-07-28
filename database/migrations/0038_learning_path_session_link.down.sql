-- Recreatable on demand (the next start of the stage would create a fresh
-- session), nothing else references this column.
ALTER TABLE user_stage_completions
  DROP COLUMN IF EXISTS training_session_id;
