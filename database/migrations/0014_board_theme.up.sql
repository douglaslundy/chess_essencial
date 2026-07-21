CREATE TYPE board_theme AS ENUM ('classic', 'staunton_3d', 'wood');

ALTER TABLE user_profiles
  ADD COLUMN board_theme board_theme NOT NULL DEFAULT 'classic';
