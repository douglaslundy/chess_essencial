import type { AiProvider } from '@xadrez/contracts';

export class AiProviderKeyInvalidError extends Error {
  constructor(
    readonly provider: AiProvider,
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
  }
}

export interface LiveModel {
  contextWindowTokens: number | null;
  id: string;
  maxOutputTokens: number | null;
}

const REQUEST_TIMEOUT_MS = 15_000;

async function fetchJson(url: string, init: RequestInit, provider: AiProvider): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    throw new AiProviderKeyInvalidError(
      provider,
      503,
      error instanceof Error
        ? `Não foi possível contatar o provedor: ${error.message}`
        : 'Não foi possível contatar o provedor.',
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new AiProviderKeyInvalidError(
      provider,
      response.status,
      'Chave de API inválida ou sem permissão.',
    );
  }
  if (response.status === 429) {
    throw new AiProviderKeyInvalidError(
      provider,
      429,
      'Limite de requisições do provedor atingido. Tente novamente em instantes.',
    );
  }
  if (!response.ok) {
    throw new AiProviderKeyInvalidError(
      provider,
      response.status,
      `O provedor recusou a requisição (HTTP ${response.status}).`,
    );
  }
  return response.json();
}

// OpenAI's /v1/models lists every model on the account, including
// embeddings/whisper/tts/dall-e/moderation — not just chat models. A
// denylist keeps the picker relevant without guessing at an allowlist that
// would go stale the moment OpenAI ships a new chat model family.
const OPENAI_NON_CHAT_PATTERN =
  /embedding|whisper|tts|dall-e|moderation|davinci-002|babbage|omni-moderation|codex|realtime|audio|transcribe|image/i;

export async function listAnthropicModels(apiKey: string): Promise<LiveModel[]> {
  const body = (await fetchJson(
    'https://api.anthropic.com/v1/models?limit=1000',
    { headers: { 'anthropic-version': '2023-06-01', 'x-api-key': apiKey } },
    'anthropic',
  )) as { data?: { id: string }[] };
  // Anthropic's model-listing endpoint doesn't return context window /
  // max output — those come from the static catalog (ai-providers.ts).
  return (body.data ?? []).map((model) => ({
    contextWindowTokens: null,
    id: model.id,
    maxOutputTokens: null,
  }));
}

export async function listOpenAiModels(apiKey: string): Promise<LiveModel[]> {
  const body = (await fetchJson(
    'https://api.openai.com/v1/models',
    { headers: { Authorization: `Bearer ${apiKey}` } },
    'openai',
  )) as { data?: { id: string }[] };
  return (body.data ?? [])
    .filter((model) => !OPENAI_NON_CHAT_PATTERN.test(model.id))
    .map((model) => ({ contextWindowTokens: null, id: model.id, maxOutputTokens: null }));
}

export async function listGeminiModels(apiKey: string): Promise<LiveModel[]> {
  const body = (await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=1000`,
    {},
    'gemini',
  )) as {
    models?: {
      inputTokenLimit?: number;
      name: string;
      outputTokenLimit?: number;
      supportedGenerationMethods?: string[];
    }[];
  };
  return (body.models ?? [])
    .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
    .map((model) => ({
      // Gemini's list DOES return real per-model limits — used directly
      // instead of the static catalog fallback whenever present.
      contextWindowTokens: model.inputTokenLimit ?? null,
      id: model.name.replace(/^models\//, ''),
      maxOutputTokens: model.outputTokenLimit ?? null,
    }));
}

export const CHATGPT_PLAN_MODELS = ['gpt-5.5', 'gpt-5.5-mini', 'gpt-5.4', 'gpt-5.4-mini'];

export function listModelsForProvider(provider: AiProvider, apiKey: string): Promise<LiveModel[]> {
  switch (provider) {
    case 'anthropic':
      return listAnthropicModels(apiKey);
    case 'openai':
      return listOpenAiModels(apiKey);
    case 'gemini':
      return listGeminiModels(apiKey);
    case 'chatgpt':
      // Plan-usage tokens are not meant for the model catalog endpoint; offer the
      // ChatGPT-plan models instead and let the test call confirm the choice.
      return Promise.resolve(
        CHATGPT_PLAN_MODELS.map((id) => ({ contextWindowTokens: null, id, maxOutputTokens: null })),
      );
  }
}
