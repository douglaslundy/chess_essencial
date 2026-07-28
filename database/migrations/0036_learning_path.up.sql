-- Jornada de Aprendizagem: camada de progressão por níveis construída em
-- cima do sistema de exercícios existente (exercises/exercise_attempts),
-- sem duplicar nem substituir nada. Ver
-- docs/superpowers/specs/2026-07-27-jornada-de-aprendizagem-design.md
-- (seção 6, "Modelo de dados") para a justificativa completa de cada
-- decisão abaixo.

-- Escala numérica única de dificuldade (pontes entre o enum antigo
-- beginner/intermediate/advanced/expert e o rating real do Lichess) usada
-- pra ordenar e agrupar desafios em Mundos/Níveis. Nullable: itens sem
-- dificuldade atribuída ficam de fora do pool da trilha até serem
-- classificados, nunca adivinhados.
ALTER TABLE exercises
  ADD COLUMN difficulty_score numeric,
  ADD COLUMN instructional_metadata jsonb;

CREATE INDEX exercises_difficulty_score ON exercises (difficulty_score);

-- Mundo: agrupamento pedagógico de mais alto nível (ex. "Primeiros Lances",
-- "Combinações"). Nomes/faixas de dificuldade são conteúdo, não schema —
-- populados por um script de seed determinístico, não hardcoded aqui.
CREATE TABLE learning_worlds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position integer NOT NULL UNIQUE,
  title varchar(120) NOT NULL,
  description text NOT NULL,
  difficulty_min numeric NOT NULL,
  difficulty_max numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE learning_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES learning_worlds(id) ON DELETE CASCADE,
  position integer NOT NULL,
  title varchar(120) NOT NULL,
  description text,
  difficulty_min numeric NOT NULL,
  difficulty_max numeric NOT NULL,
  challenge_count integer NOT NULL DEFAULT 5,
  -- { newPercent, reviewPercent, stretchPercent } — percentuais da FASE 6
  -- do spec, somando 100; validado na aplicação, não no banco.
  composition jsonb NOT NULL DEFAULT '{"newPercent": 70, "reviewPercent": 20, "stretchPercent": 10}',
  -- NULL = qualquer tema dentro da faixa de dificuldade serve.
  allowed_themes text[],
  preferred_themes text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (world_id, position)
);

CREATE INDEX learning_levels_world_id ON learning_levels (world_id);

CREATE TABLE learning_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level_id uuid NOT NULL REFERENCES learning_levels(id) ON DELETE CASCADE,
  position integer NOT NULL,
  type varchar(16) NOT NULL CHECK (type IN ('challenge', 'lesson', 'review', 'checkpoint', 'boss')),
  -- Setado quando type IN ('challenge', 'checkpoint', 'boss') — conteúdo fixo,
  -- igual pra todo usuário. 'review' fica NULL de propósito: é resolvida
  -- dinamicamente em runtime a partir de skill_mastery de cada usuário
  -- (FASE 8 do spec — não dá pra pré-gravar um exercício fixo quando o
  -- objetivo é reforçar a habilidade especificamente fraca DAQUELE usuário).
  exercise_id uuid REFERENCES exercises(id) ON DELETE RESTRICT,
  -- Reservado para type = 'lesson' (não usado na v1, arquitetura já suporta).
  lesson_id uuid REFERENCES lessons(id) ON DELETE RESTRICT,
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (level_id, position),
  CONSTRAINT learning_stages_content_check CHECK (
    (type = 'lesson' AND lesson_id IS NOT NULL AND exercise_id IS NULL)
    OR (type = 'review' AND exercise_id IS NULL AND lesson_id IS NULL)
    OR (type IN ('challenge', 'checkpoint', 'boss') AND exercise_id IS NOT NULL AND lesson_id IS NULL)
  )
);

CREATE INDEX learning_stages_level_id ON learning_stages (level_id);
CREATE INDEX learning_stages_exercise_id ON learning_stages (exercise_id);

-- Estado agregado de progressão por usuário (posição atual, ponto mais
-- avançado já desbloqueado). Distinto de user_stage_completions abaixo,
-- que é o estado por-Etapa.
CREATE TABLE user_learning_progress (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_world_id uuid REFERENCES learning_worlds(id) ON DELETE SET NULL,
  current_level_id uuid REFERENCES learning_levels(id) ON DELETE SET NULL,
  highest_unlocked_level_id uuid REFERENCES learning_levels(id) ON DELETE SET NULL,
  placement_level_id uuid REFERENCES learning_levels(id) ON DELETE SET NULL,
  -- Reservados pela FASE 15 do spec (gamificação) — sem UI na v1.
  xp integer NOT NULL DEFAULT 0,
  streak_days integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Estado por-Etapa: o que já foi liberado/concluído, distinto do histórico
-- de tentativas por-exercício que já existe em exercise_attempts.
CREATE TABLE user_stage_completions (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES learning_stages(id) ON DELETE CASCADE,
  status varchar(16) NOT NULL DEFAULT 'locked'
    CHECK (status IN ('locked', 'available', 'completed')),
  attempts integer NOT NULL DEFAULT 0,
  correct_first_try boolean,
  hints_used integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, stage_id)
);

CREATE INDEX user_stage_completions_stage_id ON user_stage_completions (stage_id);

-- Domínio por habilidade/tema (reaproveita o mesmo vocabulário já usado em
-- exercises.tags — garfo, cravada, mate_em_dois etc. — nenhuma taxonomia
-- paralela nova).
CREATE TABLE skill_mastery (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill varchar(60) NOT NULL,
  score numeric NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  attempts integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  last_seen_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, skill)
);
