DROP TABLE IF EXISTS lesson_attempt_actions;
DROP INDEX IF EXISTS idx_lesson_attempts_one_started;
ALTER TABLE lesson_attempts
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS content_snapshot,
  DROP COLUMN IF EXISTS lesson_version;
