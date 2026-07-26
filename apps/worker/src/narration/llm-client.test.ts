import { afterEach, describe, expect, it, vi } from 'vitest';

import { callLlm, LlmRequestError } from './llm-client.js';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('callLlm', () => {
  it('sends the system/user messages and returns the text content of the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ content: [{ text: 'Olá, aluno.', type: 'text' }] }),
      ok: true,
    });
    global.fetch = fetchMock as never;

    const result = await callLlm(
      { apiKey: 'sk-test', model: 'claude-test' },
      'system prompt',
      'user message',
    );

    expect(result).toBe('Olá, aluno.');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers).toMatchObject({ 'x-api-key': 'sk-test' });
    const body = JSON.parse(init.body as string) as { model: string; system: string };
    expect(body.model).toBe('claude-test');
    expect(body.system).toBe('system prompt');
  });

  it('throws LlmRequestError when the API responds with a non-2xx status', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('invalid api key'),
    }) as never;

    await expect(
      callLlm({ apiKey: 'bad-key', model: 'claude-test' }, 'system', 'user'),
    ).rejects.toThrow(LlmRequestError);
  });

  it('throws LlmRequestError when the response has no text content block', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ content: [] }),
      ok: true,
    }) as never;

    await expect(
      callLlm({ apiKey: 'sk-test', model: 'claude-test' }, 'system', 'user'),
    ).rejects.toThrow(LlmRequestError);
  });
});
