-- Efeitos animados (aura e vídeo de captura) em partida entre pessoas: só ficam ativos quando os
-- dois jogadores aceitam. O padrão é não aceitar.
ALTER TABLE game_players ADD COLUMN effects_consent boolean NOT NULL DEFAULT false;
