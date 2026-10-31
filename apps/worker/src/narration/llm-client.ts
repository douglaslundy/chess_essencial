// Thin wrapper over each provider's chat/generation API via plain fetch —
// no SDK dependencies needed for a single JSON-in/JSON-out call per
// provider. The chess calculation (legality, best move, evaluation,
// quality) always comes from the Stockfish-backed pipeline in analysis/;
// the LLM's only job is to turn already-computed facts into natural spoken
// Portuguese narration. It never picks moves or invents evaluations.
import type { AiProvider } from '@xadrez/contracts';

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_TOKENS = 1024;

export type LlmProvider = AiProvider;

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

/**
 * OpenAI renamed the output cap to max_completion_tokens (newer models reject max_tokens).
 * Reasoning models (o-series, gpt-5) also spend that budget thinking before they answer,
 * so they get headroom or the reply can come back empty.
 */
export function openAiTokenBudget(model: string, maxTokens: number) {
  return /^(o\d|gpt-5)/i.test(model) ? maxTokens + 4000 : maxTokens;
}

async function callOpenAi(config: LlmConfig, system: string, userMessage: string) {
  return withTimeout(async (signal) => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      body: JSON.stringify({
        max_completion_tokens: openAiTokenBudget(config.model, MAX_OUTPUT_TOKENS),
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

// "Sign in with ChatGPT" plan usage only runs through the Responses API, streaming and
// unstored, and rejects system-role items, temperature and max_output_tokens. The system
// prompt therefore travels inside the single user message.
const CHATGPT_RESPONSES_URL = 'https://api.openai.com/v1/responses';

/** Joins the text deltas of a Responses API event stream (falls back to the completed event). */
export function parseResponsesStream(stream: string): string {
  let text = '';
  let completed = '';
  for (const line of stream.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    let event: {
      delta?: string;
      response?: { output?: Array<{ content?: Array<{ text?: string }> }> };
      type?: string;
    };
    try {
      event = JSON.parse(payload) as typeof event;
    } catch {
      continue;
    }
    if (event.type === 'response.output_text.delta' && event.delta) text += event.delta;
    if (event.type === 'response.completed') {
      completed = (event.response?.output ?? [])
        .flatMap((item) => item.content ?? [])
        .map((part) => part.text ?? '')
        .join('');
    }
  }
  return (text || completed).trim();
}

async function callChatgpt(config: LlmConfig, system: string, userMessage: string) {
  return withTimeout(async (signal) => {
    const response = await fetch(CHATGPT_RESPONSES_URL, {
      body: JSON.stringify({
        input: [
          {
            content: [{ text: `${system}\n\n${userMessage}`, type: 'input_text' }],
            role: 'user',
          },
        ],
        model: config.model,
        store: false,
        stream: true,
      }),
      headers: {
        accept: 'text/event-stream',
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      method: 'POST',
      signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new LlmRequestError(`ChatGPT respondeu ${response.status}: ${body.slice(0, 500)}`);
    }
    const text = parseResponsesStream(await response.text());
    if (!text) throw new LlmRequestError('Resposta do ChatGPT sem conteúdo de texto');
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
    case 'chatgpt':
      return callChatgpt(config, system, userMessage);
  }
}
