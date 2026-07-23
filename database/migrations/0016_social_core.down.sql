DROP INDEX IF EXISTS idx_friendships_requester_status;
DROP INDEX IF EXISTS idx_friendships_addressee_status;

ALTER TABLE users
  DROP COLUMN last_seen_at;
