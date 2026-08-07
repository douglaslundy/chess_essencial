import { afterEach, describe, expect, it, vi } from 'vitest';

import { LiveNarrationService } from './live-narration.service.js';
import type { AuthoritativeLiveNarrationRequest } from './prompts.js';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function fakeAiProviders(config: { apiKey: string; model: string; provider: 'anthropic' } | null) {
  return { resolveActiveConfig: vi.fn().mockResolvedValue(config) };
}

function fakeDatabase(rows: { narrative: string }[] = []) {
  const sql = vi.fn().mockResolvedValue(rows) as unknown as { client: unknown };
  return { client: sql };
}

const suggestionInput: AuthoritativeLiveNarrationRequest = {
  bestMoveUci: 'e2e4',
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  kind: 'suggestion',
  mate: null,
  scoreCp: 30,
};

const qualityInput: AuthoritativeLiveNarrationRequest = {
  bestMoveUci: 'e2e4',
  centipawnLoss: 250,
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  kind: 'quality',
  missedWin: false,
  quality: 'erro',
  uci: 'a2a3',
};

describe('LiveNarrationService', () => {
  it('returns a null narrative without ever calling the LLM when no provider is configured', async () => {
    const aiProviders = fakeAiProviders(null);
    const fetchMock = vi.fn();
    global.fetch = fetchMock as never;
    const service = new LiveNarrationService(aiProviders as never, fakeDatabase() as never);

    const result = await service.narrate(suggestionInput);

    expect(result).toEqual({ narrative: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls the LLM for a suggestion and returns its narrative, uncached', async () => {
    const aiProviders = fakeAiProviders({
      apiKey: 'sk-test',
      model: 'claude-test',
      provider: 'anthropic',
    });
    global.fetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          content: [{ text: 'Isso desenvolve a iniciativa.', type: 'text' }],
        }),
      ok: true,
    }) as never;
    const service = new LiveNarrationService(aiProviders as never, fakeDatabase() as never);

    const result = await service.narrate(suggestionInput);

    expect(result).toEqual({
      narrative: 'Eu sugiro mover peão de e2 para e4. Isso desenvolve a iniciativa.',
    });
  });

  it('quality narration: cache miss calls the LLM and writes the cache', async () => {
    const aiProviders = fakeAiProviders({
      apiKey: 'sk-test',
      model: 'claude-test',
      provider: 'anthropic',
    });
    global.fetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({ content: [{ text: 'Esse lance perde material à toa.', type: 'text' }] }),
      ok: true,
    }) as never;
    const sqlCalls: unknown[][] = [];
    const sql = vi.fn((...args: unknown[]) => {
      sqlCalls.push(args);
      // First call is the SELECT cache lookup (miss); second is the INSERT.
      return sqlCalls.length === 1 ? Promise.resolve([]) : Promise.resolve([]);
    }) as unknown as { client: unknown };
    const database = { client: sql };
    const service = new LiveNarrationService(aiProviders as never, database as never);

    const result = await service.narrate(qualityInput);

    expect(result).toEqual({
      narrative:
        'Você está prestes a mover peão de a2 para a3. Eu classifico esse lance como erro, com perda de 250 centipawns. Esse lance perde material à toa.',
    });
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it('quality narration: cache hit never calls the LLM', async () => {
    const aiProviders = fakeAiProviders({
      apiKey: 'sk-test',
      model: 'claude-test',
      provider: 'anthropic',
    });
    const fetchMock = vi.fn();
    global.fetch = fetchMock as never;
    let call = 0;
    const sql = vi.fn(() => {
      call += 1;
      // First call: SELECT finds a cached row. Second: the hit_count UPDATE.
      return call === 1
        ? Promise.resolve([{ narrative: 'Já vi essa exatamente antes.' }])
        : Promise.resolve([]);
    }) as unknown as { client: unknown };
    const database = { client: sql };
    const service = new LiveNarrationService(aiProviders as never, database as never);

    const result = await service.narrate(qualityInput);

    expect(result).toEqual({
      narrative:
        'Você está prestes a mover peão de a2 para a3. Eu classifico esse lance como erro, com perda de 250 centipawns. Já vi essa exatamente antes.',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('replaces conflicting piece claims with a deterministic queen description', async () => {
    const aiProviders = fakeAiProviders({
      apiKey: 'sk-test',
      model: 'claude-test',
      provider: 'anthropic',
    });
    global.fetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({ content: [{ text: 'Mova o peão com firmeza.', type: 'text' }] }),
      ok: true,
    }) as never;
    const service = new LiveNarrationService(aiProviders as never, fakeDatabase() as never);

    const result = await service.narrate({
      bestMoveUci: 'd1h5',
      fen: '4k3/8/8/8/8/8/8/3QK3 w - - 0 1',
      kind: 'suggestion',
      mate: null,
      scoreCp: 200,
    });

    expect(result.narrative).toContain('dama de d1 para h5');
    expect(result.narrative).not.toContain('peão');
  });

  it('never lets an LLM failure escape - a live game must never be interrupted by narration', async () => {
    const aiProviders = fakeAiProviders({
      apiKey: 'sk-test',
      model: 'claude-test',
      provider: 'anthropic',
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('internal error'),
    }) as never;
    const service = new LiveNarrationService(aiProviders as never, fakeDatabase() as never);

    const result = await service.narrate(suggestionInput);

    expect(result).toEqual({ narrative: null });
  });
});
