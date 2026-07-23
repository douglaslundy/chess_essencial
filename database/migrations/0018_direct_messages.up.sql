CREATE TABLE direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body varchar(2000) NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sender_id <> recipient_id)
);
CREATE INDEX idx_direct_messages_conversation
  ON direct_messages(least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at DESC);
CREATE INDEX idx_direct_messages_recipient_unread
  ON direct_messages(recipient_id, sender_id) WHERE read_at IS NULL;
