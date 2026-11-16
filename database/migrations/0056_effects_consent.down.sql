-- Rollback: remove o aceite dos efeitos (volta a valer só a configuração de cada jogador).
ALTER TABLE game_players DROP COLUMN IF EXISTS effects_consent;
