DROP INDEX IF EXISTS idx_exercise_attempts_user_time;
DROP INDEX IF EXISTS idx_lesson_exercises_exercise;
DROP INDEX IF EXISTS idx_exercises_search;
ALTER TABLE exercise_attempts DROP COLUMN IF EXISTS training_session_id;
DROP TABLE IF EXISTS exercise_training_items;
DROP TABLE IF EXISTS exercise_training_sessions;
DROP TABLE IF EXISTS lesson_exercises;
ALTER TABLE exercises DROP CONSTRAINT IF EXISTS exercises_import_run_fk;
ALTER TABLE exercises
  DROP COLUMN IF EXISTS import_metadata,
  DROP COLUMN IF EXISTS import_run_id,
  DROP COLUMN IF EXISTS position_type;
DROP TABLE IF EXISTS exercise_import_runs;
