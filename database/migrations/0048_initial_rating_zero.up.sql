-- Every player now starts at rating 0 (rating-domain INITIAL_RATING) instead of 1200.
ALTER TABLE rating_profiles
  ALTER COLUMN rating SET DEFAULT 0,
  ALTER COLUMN peak_rating SET DEFAULT 0;

-- Humans who never had a rated game still hold the old 1200 seed: move them to 0. Bot personas
-- (their own seeded ratings), the shared practice bot and anyone with a rated game are untouched.
UPDATE rating_profiles rp
SET rating = 0, peak_rating = 0, version = version + 1, updated_at = now()
WHERE rp.games_count = 0
  AND rp.rating = 1200
  AND rp.user_id <> '00000000-0000-4000-8000-000000000b07'
  AND NOT EXISTS (SELECT 1 FROM bot_personas bp WHERE bp.user_id = rp.user_id)
  AND NOT EXISTS (
    SELECT 1 FROM rating_transactions t WHERE t.user_id = rp.user_id AND t.pool = rp.pool
  );
