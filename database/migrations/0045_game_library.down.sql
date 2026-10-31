-- Rollback: descarta a biblioteca e as revisões geradas (recarregáveis via db:import-library;
-- revisões de IA precisam ser regeneradas e consomem créditos novamente).
DROP TABLE IF EXISTS library_game_reviews;
DROP TABLE IF EXISTS library_games;
