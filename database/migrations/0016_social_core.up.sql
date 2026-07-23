ALTER TABLE users
  ADD COLUMN last_seen_at timestamptz;

CREATE INDEX idx_friendships_addressee_status ON friendships(addressee_id, status);
CREATE INDEX idx_friendships_requester_status ON friendships(requester_id, status);
