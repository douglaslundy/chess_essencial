CREATE TABLE bot_personas (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  target_rating integer NOT NULL CHECK (target_rating BETWEEN 100 AND 4000),
  online_windows jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bot_personas_target_rating_idx ON bot_personas(target_rating);
