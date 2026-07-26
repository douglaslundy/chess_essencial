CREATE TABLE game_narrations (
  game_id uuid PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  status game_analysis_status NOT NULL DEFAULT 'pending',
  summary text,
  key_moments jsonb,
  patterns jsonb,
  study_plan jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_game_narrations_pending ON game_narrations(created_at) WHERE status = 'pending';

-- Reusable per-position narration cache: the same tactical moment (exact
-- position + move + engine's best alternative + quality band) can recur
-- across different games/users (openings, common blunders, bot games), so a
-- narrative explanation is cached and looked up before ever calling the LLM
-- again for that exact moment.
CREATE TABLE move_narration_cache (
  cache_key varchar(64) PRIMARY KEY,
  fen_before text NOT NULL,
  move_uci varchar(8) NOT NULL,
  best_move_uci varchar(8),
  quality move_quality NOT NULL,
  narrative text NOT NULL,
  hit_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);
