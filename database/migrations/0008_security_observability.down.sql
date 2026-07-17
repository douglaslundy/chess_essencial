DROP INDEX IF EXISTS idx_audit_logs_entity_created;
DROP INDEX IF EXISTS idx_audit_logs_actor_created;
DROP TABLE IF EXISTS moderation_reports;
DROP TABLE IF EXISTS user_blocks;
ALTER TABLE user_profiles
  DROP COLUMN IF EXISTS allow_friend_requests,
  DROP COLUMN IF EXISTS allow_challenges;
