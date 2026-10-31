import { z } from 'zod';

// Providers wired up for LLM calls (apps/worker/src/narration/llm-client.ts). "chatgpt" is
// the OAuth option (Sign in with ChatGPT, plan usage) next to the API-key ones.
export const aiProviderSchema = z.enum(['anthropic', 'openai', 'gemini', 'chatgpt']);

export const aiProviderModelMetadataSchema = z.object({
  contextWindowTokens: z.number().int().positive().nullable(),
  inputPricePerMillionTokensUsd: z.number().nonnegative().nullable(),
  maxOutputTokens: z.number().int().positive().nullable(),
  outputPricePerMillionTokensUsd: z.number().nonnegative().nullable(),
});

export const aiProviderModelSchema = z.object({
  id: z.string(),
  metadata: aiProviderModelMetadataSchema,
});

// The API key itself is never returned once set — only whether one is
// configured and a short masked preview (e.g. "sk-…ab12"), same convention
// already used for SMTP/Mercado Pago. availableModels comes from the
// provider's own model-listing endpoint at validation time (see
// AiProvidersService#validateAndListModels), enriched with the metadata
// catalog below for whatever the API itself doesn't return.
export const aiProviderKeySchema = z.object({
  availableModels: z.array(aiProviderModelSchema),
  hasApiKey: z.boolean(),
  isActive: z.boolean(),
  keyPreview: z.string().nullable(),
  lastValidatedAt: z.string().datetime().nullable(),
  lastValidationError: z.string().nullable(),
  model: z.string().nullable(),
  /** ChatGPT (OAuth) only: the OAuth client registered with OpenAI. */
  oauthClientId: z.string().nullable().optional(),
  provider: aiProviderSchema,
});

export const updateAiProviderKeyInputSchema = z.object({
  // Optional: omitting it (or blank) re-validates/re-lists models with the
  // key already on file, without changing it — same "leave blank to keep"
  // convention as SMTP/Mercado Pago.
  apiKey: z.string().trim().min(1).max(500).optional(),
  model: z.string().trim().min(1).max(120),
});

export const updateAiProviderActiveInputSchema = z.object({
  isActive: z.boolean(),
});

// First step of the admin flow: validate a key and see the real models
// available for that account, before committing to save it (see update()
// in ai-providers.service.ts, which re-validates on save regardless).
export const listAiProviderModelsInputSchema = z.object({
  apiKey: z.string().trim().min(1).max(500).optional(),
});

export const aiProviderModelListSchema = z.object({
  models: z.array(aiProviderModelSchema),
});

/** Starts "Sign in with ChatGPT" (OAuth 2.0 + PKCE) for the platform's AI calls. */
export const chatgptOAuthStartInputSchema = z.object({
  clientId: z.string().trim().min(1).max(200),
});

export const chatgptOAuthStartResultSchema = z.object({
  authorizeUrl: z.string().url(),
  redirectUri: z.string().url(),
});

export const aiProviderTestResultSchema = z.object({
  generatedText: z.string(),
});

export type AiProvider = z.infer<typeof aiProviderSchema>;
export type AiProviderModel = z.infer<typeof aiProviderModelSchema>;
export type AiProviderModelMetadata = z.infer<typeof aiProviderModelMetadataSchema>;
export type AiProviderKey = z.infer<typeof aiProviderKeySchema>;
export type AiProviderModelList = z.infer<typeof aiProviderModelListSchema>;
export type AiProviderTestResult = z.infer<typeof aiProviderTestResultSchema>;
export type ChatgptOAuthStartInput = z.infer<typeof chatgptOAuthStartInputSchema>;
export type ChatgptOAuthStartResult = z.infer<typeof chatgptOAuthStartResultSchema>;
export type ListAiProviderModelsInput = z.infer<typeof listAiProviderModelsInputSchema>;
export type UpdateAiProviderKeyInput = z.infer<typeof updateAiProviderKeyInputSchema>;
export type UpdateAiProviderActiveInput = z.infer<typeof updateAiProviderActiveInputSchema>;

/**
 * Versioned fallback for context window / max output / pricing that a
 * provider's own model-listing endpoint doesn't return (none of the 3 do,
 * as of the date below). Sourced directly from each provider's official
 * pricing/model docs — never invented. A model missing from here (new
 * release, or a provider that did start returning the field) just shows
 * "indisponível" in the UI instead of a guessed number; this table is a
 * fallback, not a source of truth to keep in perfect lockstep with every
 * release.
 *
 * Last verified: 2026-07-26, against:
 *  - https://platform.claude.com/docs/en/docs/about-claude/pricing
 *  - https://platform.claude.com/docs/en/docs/about-claude/models/overview
 *  - https://developers.openai.com/api/docs/pricing
 *  - https://developers.openai.com/api/docs/models
 *  - https://ai.google.dev/gemini-api/docs/pricing
 */
export const AI_MODEL_CATALOG_UPDATED_AT = '2026-07-26';

export const AI_MODEL_METADATA_CATALOG: Record<
  AiProvider,
  Record<string, AiProviderModelMetadata>
> = {
  // Plan usage is billed to the ChatGPT subscription, not per token: no prices to show.
  chatgpt: {},
  anthropic: {
    'claude-haiku-4-5': {
      contextWindowTokens: 200_000,
      inputPricePerMillionTokensUsd: 1,
      maxOutputTokens: 64_000,
      outputPricePerMillionTokensUsd: 5,
    },
    'claude-opus-5': {
      contextWindowTokens: 1_000_000,
      inputPricePerMillionTokensUsd: 5,
      maxOutputTokens: 128_000,
      outputPricePerMillionTokensUsd: 25,
    },
    // Introductory pricing ($2/$10) runs through 2026-08-31; standard
    // pricing ($3/$15) applies after that — this table isn't
    // date-sensitive, so it holds the price in effect as of the date above.
    'claude-sonnet-5': {
      contextWindowTokens: 1_000_000,
      inputPricePerMillionTokensUsd: 2,
      maxOutputTokens: 128_000,
      outputPricePerMillionTokensUsd: 10,
    },
  },
  gemini: {
    'gemini-2.5-flash': {
      contextWindowTokens: 1_000_000,
      inputPricePerMillionTokensUsd: 0.3,
      maxOutputTokens: null,
      outputPricePerMillionTokensUsd: 2.5,
    },
    'gemini-3.1-pro-preview': {
      contextWindowTokens: null,
      inputPricePerMillionTokensUsd: 2,
      maxOutputTokens: null,
      outputPricePerMillionTokensUsd: 12,
    },
    'gemini-3.6-flash': {
      contextWindowTokens: null,
      inputPricePerMillionTokensUsd: 1.5,
      maxOutputTokens: null,
      outputPricePerMillionTokensUsd: 7.5,
    },
  },
  openai: {
    'gpt-5.6-luna': {
      contextWindowTokens: 1_050_000,
      inputPricePerMillionTokensUsd: 1,
      maxOutputTokens: 128_000,
      outputPricePerMillionTokensUsd: 6,
    },
    'gpt-5.6-sol': {
      contextWindowTokens: 1_050_000,
      inputPricePerMillionTokensUsd: 5,
      maxOutputTokens: 128_000,
      outputPricePerMillionTokensUsd: 30,
    },
    'gpt-5.6-terra': {
      contextWindowTokens: 1_050_000,
      inputPricePerMillionTokensUsd: 2.5,
      maxOutputTokens: 128_000,
      outputPricePerMillionTokensUsd: 15,
    },
  },
};

export function lookupModelMetadata(
  provider: AiProvider,
  modelId: string,
): AiProviderModelMetadata {
  return (
    AI_MODEL_METADATA_CATALOG[provider][modelId] ?? {
      contextWindowTokens: null,
      inputPricePerMillionTokensUsd: null,
      maxOutputTokens: null,
      outputPricePerMillionTokensUsd: null,
    }
  );
}
