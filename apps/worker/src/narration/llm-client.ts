// Thin wrapper over the Anthropic Messages API via plain fetch — no SDK
// dependency needed for a single JSON-in/JSON-out endpoint. The chess
// calculation (legality, best move, evaluation, quality) always comes from
// the Stockfish-backed pipeline in analysis/; the LLM's only job is to turn
// already-computed facts into natural spoken Portuguese narration. It never
// picks moves or invents evaluations.
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_TOKENS = 1024;

export interface LlmConfig {
  apiKey: string;
  model: string;
}

export class LlmRequestError extends Error {}

export async function callLlm(
  config: LlmConfig,
  system: string,
  userMessage: string,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      body: JSON.stringify({
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [{ content: userMessage, role: 'user' }],
        model: config.model,
        system,
      }),
      headers: {
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
        'x-api-key': config.apiKey,
      },
      method: 'POST',
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new LlmRequestError(
        `Anthropic API respondeu ${response.status}: ${body.slice(0, 500)}`,
      );
    }
    const data = (await response.json()) as {
      content: Array<{ text?: string; type: string }>;
    };
    const text = data.content.find((block) => block.type === 'text')?.text?.trim();
    if (!text) throw new LlmRequestError('Resposta da Anthropic sem conteúdo de texto');
    return text;
  } finally {
    clearTimeout(timeout);
  }
}
