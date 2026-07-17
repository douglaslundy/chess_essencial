CREATE TABLE game_review_annotations (
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ply integer NOT NULL CHECK (ply >= 0),
  comment varchar(2000),
  arrows jsonb NOT NULL DEFAULT '[]'::jsonb,
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, user_id, ply)
);

CREATE INDEX idx_game_review_annotations_user_game
  ON game_review_annotations (user_id, game_id, ply);