-- PostgreSQL schema de referência. Ajuste nomes conforme ORM.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE user_status AS ENUM ('pending','active','suspended','deleted');
CREATE TYPE game_status AS ENUM ('created','waiting','active','finished','aborted');
CREATE TYPE game_result AS ENUM ('white_win','black_win','draw','none');
CREATE TYPE termination_reason AS ENUM ('checkmate','resignation','timeout','stalemate','repetition','fifty_move','insufficient_material','agreement','abandonment','admin','none');
CREATE TYPE color_side AS ENUM ('white','black');
CREATE TYPE rating_pool AS ENUM ('bullet','blitz','rapid','classical','correspondence');
CREATE TYPE publication_status AS ENUM ('draft','published','archived');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext UNIQUE NOT NULL,
  username citext UNIQUE NOT NULL,
  password_hash text NOT NULL,
  status user_status NOT NULL DEFAULT 'pending',
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name varchar(80) NOT NULL,
  avatar_url text,
  country_code char(2),
  timezone varchar(64) NOT NULL DEFAULT 'UTC',
  locale varchar(10) NOT NULL DEFAULT 'pt-BR',
  birth_year smallint,
  bio varchar(500),
  is_profile_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash text NOT NULL,
  user_agent text,
  ip_hash text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE friendships (
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status varchar(20) NOT NULL CHECK (status IN ('pending','accepted','blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

CREATE TABLE rating_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pool rating_pool NOT NULL,
  rating integer NOT NULL DEFAULT 1200,
  games_count integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  draws integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  peak_rating integer NOT NULL DEFAULT 1200,
  has_ever_reached_2400 boolean NOT NULL DEFAULT false,
  provisional boolean NOT NULL DEFAULT true,
  version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, pool)
);

CREATE TABLE game_time_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(40) UNIQUE NOT NULL,
  label varchar(80) NOT NULL,
  pool rating_pool NOT NULL,
  initial_ms integer NOT NULL CHECK (initial_ms > 0),
  increment_ms integer NOT NULL DEFAULT 0 CHECK (increment_ms >= 0),
  delay_ms integer NOT NULL DEFAULT 0 CHECK (delay_ms >= 0),
  rated boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status game_status NOT NULL DEFAULT 'created',
  result game_result NOT NULL DEFAULT 'none',
  termination termination_reason NOT NULL DEFAULT 'none',
  time_control_id uuid NOT NULL REFERENCES game_time_controls(id),
  rated boolean NOT NULL,
  initial_fen text NOT NULL DEFAULT 'startpos',
  current_fen text NOT NULL,
  side_to_move color_side NOT NULL DEFAULT 'white',
  halfmove_clock integer NOT NULL DEFAULT 0,
  fullmove_number integer NOT NULL DEFAULT 1,
  version bigint NOT NULL DEFAULT 0,
  white_clock_ms bigint NOT NULL,
  black_clock_ms bigint NOT NULL,
  active_clock_started_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE game_players (
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  color color_side NOT NULL,
  rating_before integer NOT NULL,
  rating_after integer,
  rating_delta integer,
  connected_at timestamptz,
  disconnected_at timestamptz,
  PRIMARY KEY (game_id, color),
  UNIQUE(game_id, user_id)
);

CREATE TABLE game_moves (
  id bigserial PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  ply integer NOT NULL CHECK (ply > 0),
  color color_side NOT NULL,
  client_move_id uuid NOT NULL,
  uci varchar(8) NOT NULL,
  san varchar(32) NOT NULL,
  from_square char(2) NOT NULL,
  to_square char(2) NOT NULL,
  promotion char(1),
  fen_before text NOT NULL,
  fen_after text NOT NULL,
  clock_before_ms bigint NOT NULL,
  clock_after_ms bigint NOT NULL,
  server_received_at timestamptz NOT NULL,
  committed_at timestamptz NOT NULL DEFAULT now(),
  think_time_ms integer NOT NULL DEFAULT 0,
  flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(game_id, ply),
  UNIQUE(game_id, client_move_id)
);

CREATE INDEX idx_game_moves_game_ply ON game_moves(game_id, ply);
CREATE INDEX idx_games_status_created ON games(status, created_at DESC);
CREATE INDEX idx_games_finished ON games(finished_at DESC) WHERE status='finished';

CREATE TABLE game_pgn (
  game_id uuid PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  pgn text NOT NULL,
  checksum_sha256 char(64) NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE draw_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  offered_by uuid NOT NULL REFERENCES users(id),
  status varchar(20) NOT NULL CHECK(status IN ('pending','accepted','declined','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE direct_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenged_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  time_control_id uuid NOT NULL REFERENCES game_time_controls(id),
  challenger_color color_side,
  status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','declined','cancelled','expired')),
  game_id uuid REFERENCES games(id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CHECK (challenger_id <> challenged_id)
);

CREATE UNIQUE INDEX uq_direct_challenges_pending_pair
  ON direct_challenges (challenger_id, challenged_id)
  WHERE status = 'pending';

CREATE TABLE rating_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  game_id uuid NOT NULL REFERENCES games(id),
  pool rating_pool NOT NULL,
  rating_before integer NOT NULL,
  opponent_rating integer NOT NULL,
  expected_score numeric(5,4) NOT NULL,
  actual_score numeric(2,1) NOT NULL,
  k_factor integer NOT NULL,
  delta integer NOT NULL,
  rating_after integer NOT NULL,
  algorithm_version varchar(40) NOT NULL,
  calculation jsonb NOT NULL,
  transaction_type varchar(20) NOT NULL DEFAULT 'game'
    CHECK (transaction_type IN ('game','reversal')),
  reversal_of uuid REFERENCES rating_transactions(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_rating_transactions_game
  ON rating_transactions (user_id, game_id)
  WHERE transaction_type = 'game';

CREATE UNIQUE INDEX uq_rating_transactions_reversal
  ON rating_transactions (reversal_of)
  WHERE reversal_of IS NOT NULL;

CREATE FUNCTION prevent_rating_transaction_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'rating_transactions is an immutable ledger';
END;
$$;

CREATE TRIGGER rating_transactions_immutable
BEFORE UPDATE OR DELETE ON rating_transactions
FOR EACH ROW EXECUTE FUNCTION prevent_rating_transaction_mutation();

CREATE TABLE matchmaking_queue (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  pool rating_pool NOT NULL,
  time_control_id uuid NOT NULL REFERENCES game_time_controls(id),
  rating integer NOT NULL,
  min_rating integer NOT NULL,
  max_rating integer NOT NULL,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rating_profiles_pool_rank
  ON rating_profiles (pool, rating DESC, games_count DESC, user_id);
CREATE INDEX idx_rating_transactions_user_created
  ON rating_transactions (user_id, created_at DESC);
CREATE INDEX idx_matchmaking_queue_control_time
  ON matchmaking_queue (time_control_id, enqueued_at);

CREATE TABLE courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug citext UNIQUE NOT NULL,
  title varchar(200) NOT NULL,
  description text NOT NULL,
  status publication_status NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE course_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  position integer NOT NULL,
  title varchar(200) NOT NULL,
  description text,
  source_volume integer,
  UNIQUE(course_id, position)
);

CREATE TABLE lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  slug citext NOT NULL,
  position integer NOT NULL,
  title varchar(200) NOT NULL,
  summary text,
  estimated_minutes integer NOT NULL DEFAULT 10,
  status publication_status NOT NULL DEFAULT 'draft',
  source_pages int4range,
  version integer NOT NULL DEFAULT 1,
  UNIQUE(module_id, slug),
  UNIQUE(module_id, position)
);

CREATE TABLE lesson_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  step_key varchar(80) NOT NULL,
  position integer NOT NULL,
  step_type varchar(30) NOT NULL CHECK(step_type IN ('text','board_instruction','quiz','explanation','checkpoint','summary')),
  title varchar(200),
  body_md text NOT NULL,
  initial_fen text,
  orientation color_side,
  expected_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  feedback jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_step_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  ui_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(lesson_id, step_key),
  UNIQUE(lesson_id, position)
);

CREATE TABLE user_course_enrollments (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_lesson_id uuid REFERENCES lessons(id),
  progress_percent numeric(5,2) NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, course_id)
);

CREATE TABLE lesson_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  current_step_key varchar(80),
  status varchar(20) NOT NULL CHECK(status IN ('started','completed','abandoned')),
  score numeric(6,2),
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id varchar(80) UNIQUE,
  source_number integer UNIQUE,
  module_number integer,
  chapter_number integer,
  title varchar(300),
  prompt_md text NOT NULL,
  solution_md text NOT NULL,
  difficulty varchar(20),
  category varchar(60),
  fen text,
  side_to_move color_side,
  solution_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  hints jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags text[] NOT NULL DEFAULT '{}',
  source_pages int4range,
  status publication_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE exercise_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  lesson_attempt_id uuid REFERENCES lesson_attempts(id) ON DELETE SET NULL,
  submitted_line jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct boolean NOT NULL,
  score numeric(6,2) NOT NULL DEFAULT 0,
  hints_used integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE study_annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id uuid REFERENCES games(id) ON DELETE CASCADE,
  move_id bigint REFERENCES game_moves(id) ON DELETE CASCADE,
  lesson_id uuid REFERENCES lessons(id) ON DELETE CASCADE,
  body_md text NOT NULL,
  arrows jsonb NOT NULL DEFAULT '[]'::jsonb,
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (game_id IS NOT NULL OR lesson_id IS NOT NULL)
);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type varchar(60) NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type varchar(100) NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0
);

CREATE INDEX idx_outbox_pending ON outbox_events(created_at) WHERE published_at IS NULL;

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  actor_user_id uuid REFERENCES users(id),
  action varchar(100) NOT NULL,
  entity_type varchar(80) NOT NULL,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
