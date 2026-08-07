// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

const getAvailableVoices = vi.hoisted(() => vi.fn());
const listAiVoices = vi.hoisted(() => vi.fn());
vi.mock('./speech', () => ({ getAvailableVoices }));
vi.mock('./api/client', () => ({ api: { listAiVoices } }));

const { listVoiceOptions } = await import('./voices');

describe('listVoiceOptions', () => {
  it('excludes non-Portuguese languages entirely, never using them as filler', async () => {
    getAvailableVoices.mockResolvedValueOnce([
      { lang: 'en-US', name: 'Alex' },
      { lang: 'pt-BR', name: 'Camila' },
      { lang: 'es-ES', name: 'Monica' },
    ]);

    const options = await listVoiceOptions();

    expect(options.map((o) => o.name)).toEqual(['Camila']);
  });

  it('lists Brazilian Portuguese (pt-BR) before other Portuguese locales', async () => {
    getAvailableVoices.mockResolvedValueOnce([
      { lang: 'pt-PT', name: 'Joana' },
      { lang: 'pt-AO', name: 'Ana' },
      { lang: 'pt-BR', name: 'Camila' },
    ]);

    const options = await listVoiceOptions();

    expect(options.map((o) => o.name)).toEqual(['Camila', 'Joana', 'Ana']);
  });

  it('still offers other Portuguese locales when pt-BR alone would leave too few options', async () => {
    getAvailableVoices.mockResolvedValueOnce([{ lang: 'pt-PT', name: 'Joana' }]);

    const options = await listVoiceOptions();

    expect(options).toEqual([{ label: 'Joana', lang: 'pt-PT', name: 'Joana', source: 'browser' }]);
  });

  it('caps the list at 8 voices', async () => {
    getAvailableVoices.mockResolvedValueOnce(
      Array.from({ length: 12 }, (_, i) => ({ lang: 'pt-BR', name: `Voz ${i}` })),
    );

    const options = await listVoiceOptions();

    expect(options).toHaveLength(8);
  });

  it('deduplicates voices with the same name', async () => {
    getAvailableVoices.mockResolvedValueOnce([
      { lang: 'pt-BR', name: 'Camila' },
      { lang: 'pt-BR', name: 'Camila' },
    ]);

    const options = await listVoiceOptions();

    expect(options).toHaveLength(1);
  });

  it('returns fewer than 8 when the device has fewer pt-BR voices', async () => {
    getAvailableVoices.mockResolvedValueOnce([{ lang: 'pt-BR', name: 'Camila' }]);

    const options = await listVoiceOptions();

    expect(options).toEqual([
      { label: 'Camila', lang: 'pt-BR', name: 'Camila', source: 'browser' },
    ]);
  });

  it('places configured AI-generated voices in the authenticated picker', async () => {
    getAvailableVoices.mockResolvedValueOnce([{ lang: 'pt-BR', name: 'Camila' }]);
    listAiVoices.mockResolvedValueOnce({
      items: [{ id: 'openai:marin', label: 'Treinador IA \u00b7 Marin', provider: 'openai' }],
    });

    const options = await listVoiceOptions('cookie-session-v1');

    expect(options[0]).toEqual({
      label: 'Treinador IA \u00b7 Marin',
      lang: 'pt-BR',
      name: 'openai:marin',
      source: 'openai',
    });
    expect(listAiVoices).toHaveBeenCalledWith('cookie-session-v1');
  });
});
