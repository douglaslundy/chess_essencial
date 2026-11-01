-- Rollback: restores the 1200 seed as default and for humans still without any rated game.
ALTER TABLE rating_profiles
  ALTER COLUMN rating SET DEFAULT 1200,
  ALTER COLUMN peak_rating SET DEFAULT 1200;

UPDATE rating_profiles rp
SET rating = 1200, peak_rating = 1200, version = version + 1, updated_at = now()
WHERE rp.games_count = 0
  AND rp.rating = 0
  AND rp.user_id <> '00000000-0000-4000-8000-000000000b07'
  AND NOT EXISTS (SELECT 1 FROM bot_personas bp WHERE bp.user_id = rp.user_id)
  AND NOT EXISTS (
    SELECT 1 FROM rating_transactions t WHERE t.user_id = rp.user_id AND t.pool = rp.pool
  );
