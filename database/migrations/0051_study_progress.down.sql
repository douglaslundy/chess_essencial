-- Rollback: apaga os planos de estudo e as marcações de concluído (o plano é gerado de novo ao abrir a revisão).
DROP TABLE IF EXISTS study_progress;
DROP TABLE IF EXISTS game_study_plans;
