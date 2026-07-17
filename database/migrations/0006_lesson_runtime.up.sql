ALTER TABLE lesson_attempts
  ADD COLUMN lesson_version integer NOT NULL DEFAULT 1 CHECK (lesson_version > 0),
  ADD COLUMN content_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX idx_lesson_attempts_one_started
  ON lesson_attempts (user_id, lesson_id)
  WHERE status = 'started';

CREATE TABLE lesson_attempt_actions (
  id bigserial PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES lesson_attempts(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence > 0),
  step_key varchar(80) NOT NULL,
  action jsonb NOT NULL,
  outcome varchar(20) NOT NULL CHECK (outcome IN ('correct', 'incorrect', 'continued')),
  state_after jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, sequence)
);
