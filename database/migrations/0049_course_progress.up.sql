-- Progress in the new course (docs/CURSO_DO_ZERO.md): one row per activity the student finished.
-- The course content lives in versioned web files, so activity_id is the content slug.
CREATE TABLE course_progress (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id text NOT NULL CHECK (activity_id ~ '^[a-z0-9-]{1,80}$'),
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, activity_id)
);
