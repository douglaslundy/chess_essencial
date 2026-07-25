CREATE TYPE game_analysis_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE move_quality AS ENUM ('otimo', 'excelente', 'bom', 'imprecisao', 'erro', 'gafe');

CREATE TABLE game_analyses (
  game_id uuid PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  status game_analysis_status NOT NULL DEFAULT 'pending',
  engine_depth integer NOT NULL,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_game_analyses_pending ON game_analyses(created_at) WHERE status = 'pending';

CREATE TABLE game_move_analyses (
  game_id uuid NOT NULL,
  ply integer NOT NULL,
  color color_side NOT NULL,
  score_before_cp integer,
  mate_before integer,
  score_after_cp integer,
  mate_after integer,
  best_move_uci varchar(8),
  centipawn_loss integer NOT NULL,
  quality move_quality NOT NULL,
  missed_win boolean NOT NULL DEFAULT false,
  PRIMARY KEY (game_id, ply),
  FOREIGN KEY (game_id, ply) REFERENCES game_moves(game_id, ply) ON DELETE CASCADE
);
