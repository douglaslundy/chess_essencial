CREATE TABLE direct_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenged_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  time_control_id uuid NOT NULL REFERENCES game_time_controls(id),
  challenger_color color_side,
  status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','declined','cancelled','expired')),
  game_id uuid REFERENCES games(id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CHECK (challenger_id <> challenged_id)
);

CREATE UNIQUE INDEX uq_direct_challenges_pending_pair
  ON direct_challenges (challenger_id, challenged_id)
  WHERE status = 'pending';

ALTER TABLE rating_transactions
  ADD COLUMN transaction_type varchar(20) NOT NULL DEFAULT 'game'
    CHECK (transaction_type IN ('game','reversal')),
  ADD COLUMN reversal_of uuid REFERENCES rating_transactions(id);

ALTER TABLE rating_transactions
  DROP CONSTRAINT rating_transactions_user_id_game_id_key;

CREATE UNIQUE INDEX uq_rating_transactions_game
  ON rating_transactions (user_id, game_id)
  WHERE transaction_type = 'game';

CREATE UNIQUE INDEX uq_rating_transactions_reversal
  ON rating_transactions (reversal_of)
  WHERE reversal_of IS NOT NULL;

CREATE FUNCTION prevent_rating_transaction_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'rating_transactions is an immutable ledger';
END;
$$;

CREATE TRIGGER rating_transactions_immutable
BEFORE UPDATE OR DELETE ON rating_transactions
FOR EACH ROW EXECUTE FUNCTION prevent_rating_transaction_mutation();

CREATE INDEX idx_rating_profiles_pool_rank
  ON rating_profiles (pool, rating DESC, games_count DESC, user_id);

CREATE INDEX idx_rating_transactions_user_created
  ON rating_transactions (user_id, created_at DESC);

CREATE INDEX idx_matchmaking_queue_control_time
  ON matchmaking_queue (time_control_id, enqueued_at);
