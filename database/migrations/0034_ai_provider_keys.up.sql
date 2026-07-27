-- Generalizes the single-provider "ai.narration" platform_settings row (SP,
-- 2026-07-26) into a real per-provider table with encryption at rest and an
-- explicit "at most one active provider" invariant, enforced here (not just
-- in application code) via the partial unique index below. The API key
-- itself is encrypted at the application layer (AES-256-GCM,
-- apps/api/src/common/crypto/secret-cipher.ts) before it ever reaches this
-- column — encrypted_api_key is opaque ciphertext, never plaintext.
CREATE TABLE ai_provider_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider varchar(20) NOT NULL UNIQUE CHECK (provider IN ('anthropic', 'openai', 'gemini')),
  encrypted_api_key text,
  key_preview varchar(12),
  model varchar(80),
  is_active boolean NOT NULL DEFAULT false,
  last_validated_at timestamptz,
  last_validation_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ai_provider_keys_one_active
  ON ai_provider_keys (is_active)
  WHERE is_active = true;
