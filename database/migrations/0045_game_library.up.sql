-- Biblioteca de partidas de estudo (grandes mestres / partidas famosas).
CREATE TABLE library_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_key char(40) NOT NULL UNIQUE,
  white text NOT NULL,
  black text NOT NULL,
  white_elo integer,
  black_elo integer,
  event text,
  site text,
  played_on text,
  played_year integer,
  round text,
  result text NOT NULL CHECK (result IN ('1-0', '0-1', '1/2-1/2')),
  eco text,
  opening_name text,
  opening_family text,
  moves_san text NOT NULL,
  ply_count integer NOT NULL CHECK (ply_count > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX library_games_white_idx ON library_games (lower(white));
CREATE INDEX library_games_black_idx ON library_games (lower(black));
CREATE INDEX library_games_family_idx ON library_games (opening_family);
CREATE INDEX library_games_eco_idx ON library_games (eco);
CREATE INDEX library_games_year_idx ON library_games (played_year);

-- Uma revisão por partida, gerada uma única vez e reutilizada por todos.
CREATE TABLE library_game_reviews (
  game_id uuid PRIMARY KEY REFERENCES library_games (id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('generating', 'completed', 'failed')),
  entries jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider text,
  model text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
