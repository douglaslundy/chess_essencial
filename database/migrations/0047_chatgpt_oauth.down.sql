-- Rollback: drops the ChatGPT (OAuth) connection entirely; API-key providers are untouched.
DELETE FROM ai_provider_keys WHERE provider = 'chatgpt';

ALTER TABLE ai_provider_keys
  DROP COLUMN oauth_client_id,
  DROP COLUMN encrypted_refresh_token,
  DROP COLUMN access_token_expires_at,
  DROP COLUMN encrypted_oauth_pending;

ALTER TABLE ai_provider_keys DROP CONSTRAINT IF EXISTS ai_provider_keys_provider_check;
ALTER TABLE ai_provider_keys ADD CONSTRAINT ai_provider_keys_provider_check
  CHECK (provider IN ('anthropic', 'openai', 'gemini'));
