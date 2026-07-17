ALTER TABLE exercises
  ADD COLUMN position_type varchar(30) NOT NULL DEFAULT 'legal_position'
    CHECK (position_type IN ('legal_position', 'illustrative_diagram', 'text_only')),
  ADD COLUMN import_run_id uuid,
  ADD COLUMN import_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE exercise_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name varchar(255) NOT NULL,
  total_count integer NOT NULL CHECK (total_count >= 0),
  imported_count integer NOT NULL CHECK (imported_count >= 0),
  rejected_count integer NOT NULL CHECK (rejected_count >= 0),
  rejection_report jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (total_count = imported_count + rejected_count)
);

ALTER TABLE exercises
  ADD CONSTRAINT exercises_import_run_fk
  FOREIGN KEY (import_run_id) REFERENCES exercise_import_runs(id) ON DELETE SET NULL;

CREATE TABLE lesson_exercises (
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position > 0),
  PRIMARY KEY (lesson_id, exercise_id),
  UNIQUE (lesson_id, position)
);

CREATE TABLE exercise_training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(20) NOT NULL DEFAULT 'started'
    CHECK (status IN ('started', 'completed', 'abandoned')),
  current_position integer NOT NULL DEFAULT 1 CHECK (current_position > 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE exercise_training_items (
  session_id uuid NOT NULL REFERENCES exercise_training_sessions(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position > 0),
  hints_used integer NOT NULL DEFAULT 0 CHECK (hints_used >= 0),
  solution_revealed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  PRIMARY KEY (session_id, exercise_id),
  UNIQUE (session_id, position)
);

ALTER TABLE exercise_attempts
  ADD COLUMN training_session_id uuid REFERENCES exercise_training_sessions(id) ON DELETE SET NULL;

CREATE INDEX idx_exercises_search
  ON exercises (status, module_number, chapter_number, category, difficulty, position_type);
CREATE INDEX idx_lesson_exercises_exercise ON lesson_exercises (exercise_id);
CREATE INDEX idx_exercise_attempts_user_time ON exercise_attempts (user_id, attempted_at DESC);
