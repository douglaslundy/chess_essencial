ALTER TABLE games ADD COLUMN coach_mode boolean NOT NULL DEFAULT false;
ALTER TABLE user_profiles ADD COLUMN suggest_move_enabled boolean NOT NULL DEFAULT false;
