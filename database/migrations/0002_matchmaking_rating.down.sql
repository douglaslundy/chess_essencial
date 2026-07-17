DROP INDEX IF EXISTS idx_matchmaking_queue_control_time;
DROP INDEX IF EXISTS idx_rating_transactions_user_created;
DROP INDEX IF EXISTS idx_rating_profiles_pool_rank;

DROP TRIGGER IF EXISTS rating_transactions_immutable ON rating_transactions;
DROP FUNCTION IF EXISTS prevent_rating_transaction_mutation();

DROP INDEX IF EXISTS uq_rating_transactions_reversal;
DROP INDEX IF EXISTS uq_rating_transactions_game;

DELETE FROM rating_transactions WHERE transaction_type = 'reversal';

ALTER TABLE rating_transactions
  ADD CONSTRAINT rating_transactions_user_id_game_id_key UNIQUE (user_id, game_id);

ALTER TABLE rating_transactions
  DROP COLUMN reversal_of,
  DROP COLUMN transaction_type;

DROP INDEX IF EXISTS uq_direct_challenges_pending_pair;
DROP TABLE IF EXISTS direct_challenges;
