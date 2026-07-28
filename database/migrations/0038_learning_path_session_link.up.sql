-- A Jornada de Aprendizagem reaproveita o mecanismo de avaliação
-- lance-a-lance já existente (evaluate-line), que exige uma
-- exercise_training_session real (JOIN direto, sem fallback) para
-- confirmar que o exercício é "o atual" antes de aceitar um lance. Em vez
-- de duplicar essa lógica de correção fora do módulo de exercícios, cada
-- Etapa iniciada cria uma sessão de treino de 1 item por baixo dos panos
-- (ver ExercisesRepository.createSingleItemSession) e guarda a referência
-- aqui.
ALTER TABLE user_stage_completions
  ADD COLUMN training_session_id uuid REFERENCES exercise_training_sessions(id) ON DELETE SET NULL;
