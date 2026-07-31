ALTER TABLE game_analyses
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  ADD COLUMN lease_expires_at timestamptz,
  ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE game_narrations
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  ADD COLUMN lease_expires_at timestamptz,
  ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();

DROP INDEX idx_game_analyses_pending;
CREATE INDEX idx_game_analyses_pending
  ON game_analyses (next_attempt_at, created_at)
  WHERE status = 'pending';
CREATE INDEX idx_game_analyses_processing_lease
  ON game_analyses (lease_expires_at)
  WHERE status = 'processing';

DROP INDEX idx_game_narrations_pending;
CREATE INDEX idx_game_narrations_pending
  ON game_narrations (next_attempt_at, created_at)
  WHERE status = 'pending';
CREATE INDEX idx_game_narrations_processing_lease
  ON game_narrations (lease_expires_at)
  WHERE status = 'processing';
