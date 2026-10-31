-- Áudios TTS endereçados por conteúdo: o mesmo texto+voz+modelo é sintetizado uma única vez.
CREATE TABLE voice_audio_cache (
  cache_key char(64) PRIMARY KEY,
  voice text NOT NULL,
  model text NOT NULL,
  char_count integer NOT NULL,
  audio bytea NOT NULL,
  hit_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX voice_audio_cache_last_used_idx ON voice_audio_cache (last_used_at);
