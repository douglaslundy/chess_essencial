-- Taxonomia mínima e versionada para transformar evidência objetiva do
-- Stockfish em prática recomendada sem inferir temas táticos que o motor
-- não identificou. Os aliases preservam o vocabulário legado de
-- exercises.tags e permitem evoluí-lo sem quebrar mastery/recomendações.
CREATE TABLE skill_definitions (
  skill_key varchar(60) PRIMARY KEY,
  taxonomy_version integer NOT NULL CHECK (taxonomy_version > 0),
  label varchar(120) NOT NULL,
  description text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE skill_tag_aliases (
  skill_key varchar(60) NOT NULL REFERENCES skill_definitions(skill_key) ON DELETE CASCADE,
  tag varchar(60) NOT NULL,
  PRIMARY KEY (skill_key, tag)
);

CREATE INDEX skill_tag_aliases_tag_idx ON skill_tag_aliases(tag);

INSERT INTO skill_definitions (skill_key, taxonomy_version, label, description) VALUES
  (
    'tactical_awareness', 1, 'Percepção tática',
    'Reconhecer oportunidades concretas indicadas pela avaliação do motor.'
  ),
  (
    'move_safety', 1, 'Segurança do lance',
    'Verificar respostas adversárias antes de confirmar um lance que perde avaliação.'
  );

INSERT INTO skill_tag_aliases (skill_key, tag) VALUES
  ('tactical_awareness', 'ataque_descoberto'),
  ('tactical_awareness', 'ataque_duplo'),
  ('tactical_awareness', 'cravada'),
  ('tactical_awareness', 'espeto'),
  ('tactical_awareness', 'garfo'),
  ('tactical_awareness', 'mate'),
  ('tactical_awareness', 'peca_pendurada'),
  ('tactical_awareness', 'sacrificio'),
  ('tactical_awareness', 'xeque_duplo'),
  ('move_safety', 'defesa'),
  ('move_safety', 'interposicao'),
  ('move_safety', 'peca_pendurada'),
  ('move_safety', 'salvar_o_rei');

CREATE TABLE game_error_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL,
  ply integer NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_key varchar(60) NOT NULL REFERENCES skill_definitions(skill_key),
  signal_type varchar(40) NOT NULL CHECK (signal_type IN ('missed_opportunity', 'unsafe_move')),
  confidence numeric(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  rule_version varchar(80) NOT NULL,
  evidence jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (game_id, ply) REFERENCES game_move_analyses(game_id, ply) ON DELETE CASCADE,
  UNIQUE (game_id, ply, user_id, skill_key)
);

CREATE INDEX game_error_signals_user_created_idx
  ON game_error_signals(user_id, created_at DESC);

CREATE TABLE learning_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_signal_id uuid NOT NULL UNIQUE REFERENCES game_error_signals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_key varchar(60) NOT NULL REFERENCES skill_definitions(skill_key),
  source_type varchar(30) NOT NULL CHECK (source_type IN ('game_error')),
  outcome varchar(16) NOT NULL CHECK (outcome IN ('error', 'success')),
  weight numeric(4,3) NOT NULL CHECK (weight > 0 AND weight <= 1),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX learning_evidence_user_skill_idx
  ON learning_evidence(user_id, skill_key, occurred_at DESC);

CREATE TABLE learning_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_signal_id uuid NOT NULL UNIQUE REFERENCES game_error_signals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_key varchar(60) NOT NULL REFERENCES skill_definitions(skill_key),
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  rationale text NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX learning_recommendations_user_status_idx
  ON learning_recommendations(user_id, status, created_at DESC);


-- Partidas já analisadas não voltarão à fila do worker; projeta o mesmo
-- conjunto conservador de sinais durante a migração para não deixar um
-- histórico inconsistente.
INSERT INTO game_error_signals (
  game_id, ply, user_id, skill_key, signal_type, confidence, rule_version, evidence
)
SELECT
  analysis.game_id,
  analysis.ply,
  player.user_id,
  CASE WHEN analysis.missed_win THEN 'tactical_awareness' ELSE 'move_safety' END,
  CASE WHEN analysis.missed_win THEN 'missed_opportunity' ELSE 'unsafe_move' END,
  CASE
    WHEN analysis.missed_win THEN 0.950
    WHEN analysis.quality = 'gafe' THEN 0.900
    ELSE 0.800
  END,
  'stockfish_error_signal_v1',
  jsonb_build_object(
    'centipawnLoss', analysis.centipawn_loss,
    'missedWin', analysis.missed_win,
    'quality', analysis.quality
  )
FROM game_move_analyses analysis
JOIN game_players player
  ON player.game_id = analysis.game_id AND player.color = analysis.color
LEFT JOIN game_bots bot
  ON bot.game_id = player.game_id AND bot.bot_user_id = player.user_id
WHERE bot.game_id IS NULL
  AND (analysis.missed_win OR analysis.quality IN ('erro', 'gafe'))
ON CONFLICT (game_id, ply, user_id, skill_key) DO NOTHING;

WITH inserted AS (
  INSERT INTO learning_evidence (
    error_signal_id, user_id, skill_key, source_type, outcome, weight, occurred_at
  )
  SELECT id, user_id, skill_key, 'game_error', 'error', confidence, created_at
  FROM game_error_signals
  ON CONFLICT (error_signal_id) DO NOTHING
  RETURNING user_id, skill_key
), totals AS (
  SELECT user_id, skill_key, count(*)::integer AS error_count
  FROM inserted
  GROUP BY user_id, skill_key
)
INSERT INTO skill_mastery (
  user_id, skill, attempts, success_count, error_count, score, last_seen_at
)
SELECT user_id, skill_key, error_count, 0, error_count, 0, now()
FROM totals
ON CONFLICT (user_id, skill) DO UPDATE SET
  attempts = skill_mastery.attempts + EXCLUDED.attempts,
  error_count = skill_mastery.error_count + EXCLUDED.error_count,
  score = ROUND(
    skill_mastery.success_count::numeric
      / (skill_mastery.attempts + EXCLUDED.attempts) * 100
  ),
  last_seen_at = now(),
  updated_at = now();

INSERT INTO learning_recommendations (
  error_signal_id, user_id, skill_key, exercise_id, rationale
)
SELECT
  signal.id,
  signal.user_id,
  signal.skill_key,
  practice.id,
  CASE signal.skill_key
    WHEN 'tactical_awareness'
      THEN 'Pratique a identificação de oportunidades concretas.'
    ELSE 'Pratique a verificação de ameaças antes de confirmar o lance.'
  END
FROM game_error_signals signal
JOIN LATERAL (
  SELECT exercise.id
  FROM skill_tag_aliases alias
  JOIN exercises exercise ON alias.tag = ANY(exercise.tags)
  WHERE alias.skill_key = signal.skill_key
    AND exercise.status = 'published'
    AND exercise.position_type = 'legal_position'
    AND exercise.title IS NOT NULL
    AND COALESCE(exercise.import_metadata->>'answerFormat', 'move_sequence') = 'move_sequence'
    AND jsonb_array_length(exercise.solution_lines) > 0
  ORDER BY
    EXISTS (
      SELECT 1
      FROM exercise_attempts attempt
      WHERE attempt.user_id = signal.user_id
        AND attempt.exercise_id = exercise.id
        AND attempt.correct = true
    ),
    (jsonb_array_length(exercise.hints) = 0),
    exercise.id
  LIMIT 1
) practice ON true
ON CONFLICT (error_signal_id) DO NOTHING;
