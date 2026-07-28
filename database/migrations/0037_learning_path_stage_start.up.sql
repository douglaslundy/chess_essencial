-- Complementa 0036: user_stage_completions precisa saber QUANDO uma Etapa
-- foi iniciada (pra distinguir uma tentativa correta nova de uma tentativa
-- antiga não relacionada do mesmo exercício, ex. feita antes no Treino
-- Livre) e QUAL exercício foi resolvido pra ela quando é do tipo 'review'
-- (resolvido dinamicamente por usuário a partir de skill_mastery — não dá
-- pra usar learning_stages.exercise_id, que é NULL de propósito pra esse
-- tipo, ver comentário em 0036).
ALTER TABLE user_stage_completions
  ADD COLUMN started_at timestamptz,
  ADD COLUMN resolved_exercise_id uuid REFERENCES exercises(id) ON DELETE SET NULL;
