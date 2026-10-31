-- ChatGPT (OAuth) as an extra AI provider next to the API-key ones; it never replaces them.
-- For this provider encrypted_api_key holds the short-lived OAuth access token, renewed by
-- the API from encrypted_refresh_token, so every existing consumer (API and worker) keeps
-- reading the active credential exactly the same way. encrypted_oauth_pending holds the
-- in-flight PKCE verifier/state between "Conectar" and the OAuth callback.
ALTER TABLE ai_provider_keys DROP CONSTRAINT IF EXISTS ai_provider_keys_provider_check;
ALTER TABLE ai_provider_keys ADD CONSTRAINT ai_provider_keys_provider_check
  CHECK (provider IN ('anthropic', 'openai', 'gemini', 'chatgpt'));

ALTER TABLE ai_provider_keys
  ADD COLUMN oauth_client_id varchar(200),
  ADD COLUMN encrypted_refresh_token text,
  ADD COLUMN access_token_expires_at timestamptz,
  ADD COLUMN encrypted_oauth_pending text;
