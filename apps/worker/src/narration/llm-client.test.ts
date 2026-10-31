import { afterEach, describe, expect, it, vi } from 'vitest';

import { callLlm, LlmRequestError, openAiTokenBudget } from './llm-client.js';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('callLlm', () => {
  it('anthropic: sends the system/user messages and returns the text content of the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ content: [{ text: 'Olá, aluno.', type: 'text' }] }),
      ok: true,
    });
    global.fetch = fetchMock as never;

    const result = await callLlm(
      { apiKey: 'sk-test', model: 'claude-test', provider: 'anthropic' },
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

  it('anthropic: throws LlmRequestError when the API responds with a non-2xx status', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('invalid api key'),
    }) as never;

    await expect(
      callLlm({ apiKey: 'bad-key', model: 'claude-test', provider: 'anthropic' }, 'system', 'user'),
    ).rejects.toThrow(LlmRequestError);
  });

  it('anthropic: throws LlmRequestError when the response has no text content block', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ content: [] }),
      ok: true,
    }) as never;

    await expect(
      callLlm({ apiKey: 'sk-test', model: 'claude-test', provider: 'anthropic' }, 'system', 'user'),
    ).rejects.toThrow(LlmRequestError);
  });

  it('openai: sends system+user messages and returns the assistant message content', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ choices: [{ message: { content: 'Olá, aluno.' } }] }),
      ok: true,
    });
    global.fetch = fetchMock as never;

    const result = await callLlm(
      { apiKey: 'sk-openai', model: 'gpt-4.1-mini', provider: 'openai' },
      'system prompt',
      'user message',
    );

    expect(result).toBe('Olá, aluno.');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers).toMatchObject({ authorization: 'Bearer sk-openai' });
    const body = JSON.parse(init.body as string) as {
      messages: Array<{ content: string; role: string }>;
      model: string;
    };
    expect(body.model).toBe('gpt-4.1-mini');
    expect(body.messages).toEqual([
      { content: 'system prompt', role: 'system' },
      { content: 'user message', role: 'user' },
    ]);
  });

  it('openai: throws LlmRequestError when the API responds with a non-2xx status', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('rate limited'),
    }) as never;

    await expect(
      callLlm({ apiKey: 'sk-openai', model: 'gpt-4.1-mini', provider: 'openai' }, 'system', 'user'),
    ).rejects.toThrow(LlmRequestError);
  });

  it('gemini: sends the API key as a query param and returns the candidate text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({ candidates: [{ content: { parts: [{ text: 'Olá, aluno.' }] } }] }),
      ok: true,
    });
    global.fetch = fetchMock as never;

    const result = await callLlm(
      { apiKey: 'gm-test', model: 'gemini-2.5-flash', provider: 'gemini' },
      'system prompt',
      'user message',
    );

    expect(result).toBe('Olá, aluno.');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=gm-test',
    );
    const body = JSON.parse(init.body as string) as {
      contents: Array<{ parts: Array<{ text: string }> }>;
      systemInstruction: { parts: Array<{ text: string }> };
    };
    expect(body.contents[0]?.parts[0]?.text).toBe('user message');
    expect(body.systemInstruction.parts[0]?.text).toBe('system prompt');
  });

  it('gemini: throws LlmRequestError when the response has no candidate text', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ candidates: [] }),
      ok: true,
    }) as never;

    await expect(
      callLlm(
        { apiKey: 'gm-test', model: 'gemini-2.5-flash', provider: 'gemini' },
        'system',
        'user',
      ),
    ).rejects.toThrow(LlmRequestError);
  });
});

describe('openai output cap', () => {
  it('sends max_completion_tokens (newer models reject max_tokens)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ choices: [{ message: { content: 'Ok.' } }] }),
      ok: true,
    });
    global.fetch = fetchMock as never;

    await callLlm({ apiKey: 'sk-test', model: 'gpt-4o-mini', provider: 'openai' }, 's', 'u');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty('max_tokens');
    expect(body.max_completion_tokens).toBeGreaterThan(0);
  });

  it('gives reasoning models headroom for their thinking tokens', () => {
    expect(openAiTokenBudget('gpt-4o-mini', 300)).toBe(300);
    expect(openAiTokenBudget('gpt-5.5-pro', 300)).toBe(4300);
    expect(openAiTokenBudget('o4-mini', 300)).toBe(4300);
  });
});
