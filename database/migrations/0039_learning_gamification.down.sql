DROP TABLE IF EXISTS user_learning_badges;

ALTER TABLE user_learning_progress
  DROP COLUMN IF EXISTS last_activity_date;
