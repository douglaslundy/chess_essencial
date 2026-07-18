INSERT INTO users (
  id,
  email,
  username,
  password_hash,
  status,
  email_verified_at
)
VALUES (
  '00000000-0000-4000-8000-000000000b07',
  'bot@internal.xadrez.invalid',
  'xadrez_bot',
  '$argon2id$v=19$m=65536,t=3,p=4$tfY8w/jfpydVWz+cywI0jQ$EF4JyCThCB04ZUXOZG1g74Ufjwg2BGyiCh3F+L72MNM',
  'active',
  now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_profiles (
  user_id,
  display_name,
  timezone,
  locale,
  is_profile_public,
  allow_challenges,
  allow_friend_requests
)
VALUES (
  '00000000-0000-4000-8000-000000000b07',
  'Bot Xadrez Essencial',
  'UTC',
  'pt-BR',
  false,
  false,
  false
)
ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE game_bots (
  game_id uuid PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  bot_user_id uuid NOT NULL REFERENCES users(id),
  difficulty varchar(20) NOT NULL CHECK (
    difficulty IN ('matched', 'beginner', 'intermediate', 'advanced', 'expert')
  ),
  target_rating integer NOT NULL CHECK (target_rating BETWEEN 100 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX game_bots_bot_user_idx ON game_bots(bot_user_id);
