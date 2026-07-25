// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

const getAvailableVoices = vi.hoisted(() => vi.fn());
vi.mock('./speech', () => ({ getAvailableVoices }));

const { listVoiceOptions } = await import('./voices');

describe('listVoiceOptions', () => {
  it('prioritizes Portuguese voices over other languages', async () => {
    getAvailableVoices.mockResolvedValueOnce([
      { lang: 'en-US', name: 'Alex' },
      { lang: 'pt-BR', name: 'Camila' },
      { lang: 'pt-PT', name: 'Joana' },
    ]);

    const options = await listVoiceOptions();

    expect(options.map((o) => o.name)).toEqual(['Camila', 'Joana', 'Alex']);
  });

  it('caps the list at 4 voices', async () => {
    getAvailableVoices.mockResolvedValueOnce(
      Array.from({ length: 8 }, (_, i) => ({ lang: 'pt-BR', name: `Voz ${i}` })),
    );

    const options = await listVoiceOptions();

    expect(options).toHaveLength(4);
  });

  it('deduplicates voices with the same name', async () => {
    getAvailableVoices.mockResolvedValueOnce([
      { lang: 'pt-BR', name: 'Camila' },
      { lang: 'pt-BR', name: 'Camila' },
    ]);

    const options = await listVoiceOptions();

    expect(options).toHaveLength(1);
  });

  it('returns fewer than 4 when the device has fewer voices', async () => {
    getAvailableVoices.mockResolvedValueOnce([{ lang: 'pt-BR', name: 'Camila' }]);

    const options = await listVoiceOptions();

    expect(options).toEqual([{ lang: 'pt-BR', name: 'Camila' }]);
  });
});
