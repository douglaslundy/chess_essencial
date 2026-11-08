-- Estudo de aberturas: linhas nomeadas (lichess-org/chess-openings, CC0), aulas geradas pela IA
-- (uma vez por linha e versão do prompt, reaproveitadas) e o progresso de repetição de cada aluno.
CREATE TABLE opening_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  eco varchar(3) NOT NULL,
  name text NOT NULL,
  family text NOT NULL,
  pgn text NOT NULL,
  uci text NOT NULL UNIQUE,
  ply_count integer NOT NULL CHECK (ply_count > 0),
  side text NOT NULL CHECK (side IN ('white', 'black'))
);
CREATE INDEX opening_lines_family_idx ON opening_lines (family);
CREATE INDEX opening_lines_eco_idx ON opening_lines (eco);

CREATE TABLE opening_lessons (
  opening_id uuid NOT NULL REFERENCES opening_lines(id) ON DELETE CASCADE,
  prompt_version integer NOT NULL,
  status text NOT NULL CHECK (status IN ('generating', 'completed', 'failed')),
  overview text NOT NULL DEFAULT '',
  frames jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (opening_id, prompt_version)
);

CREATE TABLE opening_progress (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opening_id uuid NOT NULL REFERENCES opening_lines(id) ON DELETE CASCADE,
  repetitions integer NOT NULL DEFAULT 0,
  ease numeric(4, 2) NOT NULL DEFAULT 2.5,
  interval_days integer NOT NULL DEFAULT 0,
  due_at timestamptz NOT NULL DEFAULT now(),
  last_result text CHECK (last_result IN ('correct', 'wrong')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, opening_id)
);
CREATE INDEX opening_progress_due_idx ON opening_progress (user_id, due_at);
