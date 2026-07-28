-- Suporte real a Etapas do tipo 'lesson' (antes recusadas explicitamente
-- pelo backend). Mesmo padrão já usado para Etapas de exercício
-- (migration 0038, training_session_id): em vez de duplicar a lógica de
-- conclusão de aula fora do módulo lesson-runtime, cada início de Etapa
-- de aula reaproveita LessonRuntimeService.start() (idempotente — devolve
-- a tentativa 'started' já existente, se houver) e guarda a referência
-- aqui, usada depois por completeStage() para confirmar a conclusão real
-- (lesson_attempts.status = 'completed'), sem confiar em nada vindo do
-- cliente.
ALTER TABLE user_stage_completions
  ADD COLUMN lesson_attempt_id uuid REFERENCES lesson_attempts(id) ON DELETE SET NULL;
