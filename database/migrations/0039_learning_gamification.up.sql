-- Jornada de Aprendizagem — FASE 15 do spec (gamificação). Escopo modesto
-- de propósito, seguindo a própria advertência do spec pra não virar "um
-- sistema de pontos sem significado": XP por Etapa concluída, sequência de
-- dias de atividade, e um punhado pequeno de conquistas atreladas a marcos
-- reais já computáveis (primeira Etapa, Mundo concluído, Nível concluído
-- sem nenhum erro, sequência de 7 dias) — sem catálogo de dezenas de
-- badges nem "desafio diário" (FASE 15 lista o conceito, mas não pede
-- infraestrutura nova de conteúdo rotativo).

-- Dia (UTC) da última Etapa concluída, usado só para calcular a sequência
-- em user_learning_progress.streak_days (coluna já existia, reservada,
-- sempre 0 até agora).
ALTER TABLE user_learning_progress
  ADD COLUMN last_activity_date date;

-- Conquistas ganhas por usuário. Catálogo (chave -> regra de concessão)
-- vive em código (learning-path.service.ts), não numa tabela — mesmo
-- padrão já usado pra planFeatureCatalog. badge_key de Mundo concluído
-- embute o id do Mundo (ex. "world_completed:<uuid>") pra permitir uma
-- linha por Mundo por usuário sem precisar de coluna de contexto
-- separada; `label` é uma cópia (não FK) do texto no momento da conquista,
-- pra sobreviver a uma futura renomeação do Mundo sem invalidar o troféu.
CREATE TABLE user_learning_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_key varchar(80) NOT NULL,
  label varchar(160) NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_key)
);

CREATE INDEX user_learning_badges_user_id ON user_learning_badges (user_id);
