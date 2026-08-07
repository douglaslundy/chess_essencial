import { afterEach, describe, expect, it, vi } from 'vitest';

import { VoiceService } from './voice.service.js';

function providers(config: { apiKey: string; model: string; provider: 'openai' } | null) {
  return { resolveProviderConfig: vi.fn().mockResolvedValue(config) };
}

describe('VoiceService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('offers AI voices only when an OpenAI key is configured', async () => {
    const unavailable = new VoiceService(providers(null) as never);
    const available = new VoiceService(
      providers({ apiKey: 'sk-test', model: 'gpt-test', provider: 'openai' }) as never,
    );

    await expect(unavailable.options()).resolves.toEqual({ items: [] });
    await expect(available.options()).resolves.toMatchObject({
      items: [
        { id: 'openai:marin', provider: 'openai' },
        { id: 'openai:cedar', provider: 'openai' },
      ],
    });
  });

  it('generates MP3 speech with the selected OpenAI voice', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      arrayBuffer: () => Promise.resolve(Uint8Array.from([1, 2, 3]).buffer),
      ok: true,
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = new VoiceService(
      providers({ apiKey: 'sk-test', model: 'gpt-test', provider: 'openai' }) as never,
    );

    await expect(service.synthesize({ text: 'Sua vez.', voice: 'openai:marin' })).resolves.toEqual(
      Buffer.from([1, 2, 3]),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/audio/speech',
      expect.objectContaining({
        body: expect.stringMatching(/"model":"gpt-4o-mini-tts".*"voice":"marin"/),
        method: 'POST',
      }),
    );
  });

  it('returns a safe explicit error when OpenAI cannot generate speech', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    const service = new VoiceService(
      providers({ apiKey: 'sk-test', model: 'gpt-test', provider: 'openai' }) as never,
    );

    await expect(service.synthesize({ text: 'Sua vez.', voice: 'openai:cedar' })).rejects.toThrow(
      'A OpenAI não conseguiu gerar a voz por IA (403). Verifique a chave, o acesso ao modelo e tente novamente.',
    );
  });
});
