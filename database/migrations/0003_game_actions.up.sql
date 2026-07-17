CREATE TABLE game_draw_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  offered_by_user_id uuid NOT NULL REFERENCES users(id),
  status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE UNIQUE INDEX uq_game_draw_offers_pending
  ON game_draw_offers (game_id)
  WHERE status = 'pending';

CREATE INDEX idx_game_draw_offers_game_created
  ON game_draw_offers (game_id, created_at DESC);