// Thin wrapper over each provider's chat/generation API via plain fetch —
// no SDK dependencies needed for a single JSON-in/JSON-out call per
// provider. The chess calculation (legality, best move, evaluation,
// quality) always comes from the Stockfish-backed pipeline in analysis/;
// the LLM's only job is to turn already-computed facts into natural spoken
// Portuguese narration. It never picks moves or invents evaluations.
import type { NarrationAiSettings } from '@xadrez/contracts';

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_TOKENS = 1024;

export type LlmProvider = NonNullable<NarrationAiSettings['provider']>;

export interface LlmConfig {
  apiKey: string;
  model: string;
  provider: LlmProvider;
}

export class LlmRequestError extends Error {}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

async function callAnthropic(config: LlmConfig, system: string, userMessage: string) {
  return withTimeout(async (signal) => {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      body: JSON.stringify({
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [{ content: userMessage, role: 'user' }],
        model: config.model,
        system,
      }),
      headers: {
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'x-api-key': config.apiKey,
      },
      method: 'POST',
      signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new LlmRequestError(
        `Anthropic API respondeu ${response.status}: ${body.slice(0, 500)}`,
      );
    }
    const data = (await response.json()) as { content: Array<{ text?: string; type: string }> };
    const text = data.content.find((block) => block.type === 'text')?.text?.trim();
    if (!text) throw new LlmRequestError('Resposta da Anthropic sem conteúdo de texto');
    return text;
  });
}

async function callOpenAi(config: LlmConfig, system: string, userMessage: string) {
  return withTimeout(async (signal) => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      body: JSON.stringify({
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          { content: system, role: 'system' },
          { content: userMessage, role: 'user' },
        ],
        model: config.model,
      }),
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      method: 'POST',
      signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new LlmRequestError(`OpenAI API respondeu ${response.status}: ${body.slice(0, 500)}`);
    }
    const data = (await response.json()) as {
      choices: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices[0]?.message?.content?.trim();
    if (!text) throw new LlmRequestError('Resposta da OpenAI sem conteúdo de texto');
    return text;
  });
}

async function callGemini(config: LlmConfig, system: string, userMessage: string) {
  return withTimeout(async (signal) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
    const response = await fetch(url, {
      body: JSON.stringify({
        contents: [{ parts: [{ text: userMessage }], role: 'user' }],
        generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
        systemInstruction: { parts: [{ text: system }] },
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new LlmRequestError(`Gemini API respondeu ${response.status}: ${body.slice(0, 500)}`);
    }
    const data = (await response.json()) as {
      candidates: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new LlmRequestError('Resposta do Gemini sem conteúdo de texto');
    return text;
  });
}

export async function callLlm(
  config: LlmConfig,
  system: string,
  userMessage: string,
): Promise<string> {
  switch (config.provider) {
    case 'anthropic':
      return callAnthropic(config, system, userMessage);
    case 'openai':
      return callOpenAi(config, system, userMessage);
    case 'gemini':
      return callGemini(config, system, userMessage);
  }
}
