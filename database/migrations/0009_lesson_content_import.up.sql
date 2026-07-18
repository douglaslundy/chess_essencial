CREATE TABLE lesson_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name varchar(255) NOT NULL,
  source_sha256 char(64) NOT NULL,
  source_pdf_sha256 char(64) NOT NULL,
  lesson_count integer NOT NULL CHECK (lesson_count >= 0),
  changed_count integer NOT NULL CHECK (changed_count >= 0),
  unchanged_count integer NOT NULL CHECK (unchanged_count >= 0),
  step_count integer NOT NULL CHECK (step_count >= 0),
  exercise_link_count integer NOT NULL CHECK (exercise_link_count >= 0),
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (lesson_count = changed_count + unchanged_count)
);

ALTER TABLE lessons
  ADD COLUMN import_run_id uuid REFERENCES lesson_import_runs(id) ON DELETE SET NULL;

ALTER TABLE lesson_versions
  ALTER COLUMN created_by_user_id DROP NOT NULL,
  ADD COLUMN import_run_id uuid REFERENCES lesson_import_runs(id) ON DELETE SET NULL,
  ADD CONSTRAINT lesson_versions_actor_check CHECK (
    (created_by_user_id IS NOT NULL AND import_run_id IS NULL)
    OR (created_by_user_id IS NULL AND import_run_id IS NOT NULL)
  );

CREATE INDEX idx_lessons_import_run ON lessons(import_run_id);
CREATE INDEX idx_lesson_versions_import_run ON lesson_versions(import_run_id);
