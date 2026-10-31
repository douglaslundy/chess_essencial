-- Rollback: descarta o cache; os áudios serão sintetizados (e cobrados) novamente sob demanda.
DROP TABLE IF EXISTS voice_audio_cache;
