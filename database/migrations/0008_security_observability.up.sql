ALTER TABLE user_profiles
  ADD COLUMN allow_challenges boolean NOT NULL DEFAULT true,
  ADD COLUMN allow_friend_requests boolean NOT NULL DEFAULT true;

CREATE TABLE user_blocks (
  blocker_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_user_id, blocked_user_id),
  CHECK (blocker_user_id <> blocked_user_id)
);

CREATE INDEX idx_user_blocks_blocked ON user_blocks(blocked_user_id, blocker_user_id);

CREATE TABLE moderation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  game_id uuid REFERENCES games(id) ON DELETE SET NULL,
  category varchar(30) NOT NULL CHECK (
    category IN ('cheating','harassment','spam','inappropriate_profile','other')
  ),
  description varchar(1000),
  status varchar(20) NOT NULL DEFAULT 'open' CHECK (
    status IN ('open','reviewing','resolved','dismissed')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reported_user_id IS NOT NULL OR game_id IS NOT NULL),
  CHECK (reported_user_id IS NULL OR reported_user_id <> reporter_user_id)
);

CREATE UNIQUE INDEX uq_moderation_reports_open_context
  ON moderation_reports (
    reporter_user_id,
    COALESCE(reported_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(game_id, '00000000-0000-0000-0000-000000000000'::uuid),
    category
  )
  WHERE status IN ('open','reviewing');

CREATE INDEX idx_moderation_reports_review_queue
  ON moderation_reports(status, created_at);

CREATE INDEX idx_audit_logs_actor_created
  ON audit_logs(actor_user_id, created_at DESC);

CREATE INDEX idx_audit_logs_entity_created
  ON audit_logs(entity_type, entity_id, created_at DESC);
