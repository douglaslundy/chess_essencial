DROP INDEX IF EXISTS idx_lesson_versions_import_run;
DROP INDEX IF EXISTS idx_lessons_import_run;
ALTER TABLE lesson_versions DROP CONSTRAINT IF EXISTS lesson_versions_actor_check;
DELETE FROM lesson_versions WHERE created_by_user_id IS NULL;
ALTER TABLE lesson_versions DROP COLUMN IF EXISTS import_run_id;
ALTER TABLE lesson_versions ALTER COLUMN created_by_user_id SET NOT NULL;
ALTER TABLE lessons DROP COLUMN IF EXISTS import_run_id;
DROP TABLE IF EXISTS lesson_import_runs;
