DROP INDEX IF EXISTS idx_game_narrations_processing_lease;
DROP INDEX IF EXISTS idx_game_narrations_pending;
DROP INDEX IF EXISTS idx_game_analyses_processing_lease;
DROP INDEX IF EXISTS idx_game_analyses_pending;

ALTER TABLE game_narrations
  DROP COLUMN IF EXISTS next_attempt_at,
  DROP COLUMN IF EXISTS lease_expires_at,
  DROP COLUMN IF EXISTS attempt_count;

ALTER TABLE game_analyses
  DROP COLUMN IF EXISTS next_attempt_at,
  DROP COLUMN IF EXISTS lease_expires_at,
  DROP COLUMN IF EXISTS attempt_count;

CREATE INDEX idx_game_analyses_pending
  ON game_analyses (created_at)
  WHERE status = 'pending';
CREATE INDEX idx_game_narrations_pending
  ON game_narrations (created_at)
  WHERE status = 'pending';
