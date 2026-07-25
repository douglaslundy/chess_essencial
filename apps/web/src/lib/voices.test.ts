// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

const getAvailableVoices = vi.hoisted(() => vi.fn());
vi.mock('./speech', () => ({ getAvailableVoices }));

const { listVoiceOptions } = await import('./voices');

describe('listVoiceOptions', () => {
  it('only offers Brazilian Portuguese voices, excluding other languages entirely', async () => {
    getAvailableVoices.mockResolvedValueOnce([
      { lang: 'en-US', name: 'Alex' },
      { lang: 'pt-BR', name: 'Camila' },
      { lang: 'pt-PT', name: 'Joana' },
    ]);

    const options = await listVoiceOptions();

    expect(options.map((o) => o.name)).toEqual(['Camila']);
  });

  it('excludes European Portuguese (pt-PT) — not the Brazilian standard', async () => {
    getAvailableVoices.mockResolvedValueOnce([
      { lang: 'pt-PT', name: 'Joana' },
      { lang: 'pt-AO', name: 'Ana' },
    ]);

    const options = await listVoiceOptions();

    expect(options).toEqual([]);
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

    expect(options).toEqual([{ lang: 'pt-BR', name: 'Camila' }]);
  });
});
