import { describe, expect, it, vi } from 'vitest';

const callLlm = vi.hoisted(() => vi.fn());
vi.mock('./llm-client.js', () => ({ callLlm }));

const { runGameNarrationJob } = await import('./game-narration-job.js');

interface Call {
  text: string;
  values: unknown[];
}

function fakeSql(
  handlers: {
    match: (text: string) => boolean;
    rows: unknown | ((values: unknown[]) => unknown);
  }[],
) {
  const calls: Call[] = [];
  const fn = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join(' ? ');
    calls.push({ text, values });
    const handler = handlers.find((entry) => entry.match(text));
    if (!handler) return Promise.resolve([]);
    const rows = typeof handler.rows === 'function' ? handler.rows(values) : handler.rows;
    return Promise.resolve(rows);
  }) as never;
  return { calls, sql: fn };
}

const AI_CONFIG_ROW = [
  { value: { apiKey: 'sk-test-123', model: 'claude-test', provider: 'anthropic' } },
];

const SUMMARY_JSON = JSON.stringify({
  padroes: ['Larga peças penduradas em posições táticas.'],
  planoDeEstudo: ['Treinar finais de torre.'],
  resumo: 'Uma partida equilibrada até um erro decisivo no meio-jogo.',
});

function defaultLlmMock() {
  callLlm.mockImplementation((_config: unknown, _system: string, message: string) =>
    Promise.resolve(
      message.startsWith('Resultado da partida') ? SUMMARY_JSON : 'Texto narrado do lance.',
    ),
  );
}

describe('runGameNarrationJob', () => {
  it('does nothing when no narration AI API key is configured', async () => {
    const { sql } = fakeSql([
      { match: (text) => text.includes('FROM platform_settings'), rows: [] },
    ]);

    const result = await runGameNarrationJob(sql);

    expect(result).toEqual({ narratedGameId: null });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it('does nothing when no narration is pending', async () => {
    callLlm.mockReset();
    const { sql } = fakeSql([
      { match: (text) => text.includes('FROM platform_settings'), rows: AI_CONFIG_ROW },
      { match: (text) => text.includes('INSERT INTO game_narrations'), rows: [] },
      { match: (text) => text.includes("SET status = 'processing'"), rows: [] },
    ]);

    const result = await runGameNarrationJob(sql);

    expect(result).toEqual({ narratedGameId: null });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it('narrates key moments (reusing the cache when hit), synthesizes the summary, and completes', async () => {
    callLlm.mockReset();
    defaultLlmMock();

    const { calls, sql } = fakeSql([
      { match: (text) => text.includes('FROM platform_settings'), rows: AI_CONFIG_ROW },
      { match: (text) => text.includes('INSERT INTO game_narrations'), rows: [] },
      {
        match: (text) => text.includes("SET status = 'processing'"),
        rows: [{ gameId: 'game-1' }],
      },
      {
        match: (text) => text.includes('FROM games'),
        rows: [{ result: 'white_win', termination: 'checkmate', timeControl: 'Blitz 3+0' }],
      },
      {
        match: (text) => text.includes('FROM game_move_analyses'),
        rows: [
          {
            bestMoveUci: 'd2d4',
            centipawnLoss: 320,
            color: 'black',
            fenBefore: 'FEN_CACHED',
            missedWin: false,
            ply: 12,
            quality: 'gafe',
            san: 'a6',
            uci: 'a7a6',
          },
          {
            bestMoveUci: 'e7e5',
            centipawnLoss: 180,
            color: 'white',
            fenBefore: 'FEN_UNCACHED',
            missedWin: true,
            ply: 20,
            quality: 'erro',
            san: 'Nf3',
            uci: 'g1f3',
          },
        ],
      },
      {
        // Moments are processed in ply order; the first lookup (ply 12) is a
        // cache hit, the second (ply 20) is a miss.
        match: (text) => text.includes('FROM move_narration_cache'),
        rows: (() => {
          let call = 0;
          return () => (call++ === 0 ? [{ narrative: 'Explicação já em cache.' }] : []);
        })(),
      },
      { match: (text) => text.includes('UPDATE move_narration_cache'), rows: [] },
      { match: (text) => text.includes('INSERT INTO move_narration_cache'), rows: [] },
      { match: (text) => text.includes('SET summary ='), rows: [] },
      { match: (text) => text.includes("SET status = 'completed'"), rows: [] },
    ]);

    const result = await runGameNarrationJob(sql);

    expect(result).toEqual({ narratedGameId: 'game-1' });
    // One moment came from cache (no LLM call for it) plus the mandatory
    // summary call: only one per-moment narration call, not two.
    expect(callLlm).toHaveBeenCalledTimes(2);

    const finalUpdate = calls.find((call) => call.text.includes('SET summary ='));
    expect(finalUpdate?.values[0]).toBe(
      'Uma partida equilibrada até um erro decisivo no meio-jogo.',
    );

    expect(calls.some((call) => call.text.includes("SET status = 'completed'"))).toBe(true);
  });

  it('marks the narration as failed instead of leaving it stuck if the LLM call throws', async () => {
    callLlm.mockReset();
    callLlm.mockRejectedValue(new Error('anthropic api down'));

    const { calls, sql } = fakeSql([
      { match: (text) => text.includes('FROM platform_settings'), rows: AI_CONFIG_ROW },
      { match: (text) => text.includes('INSERT INTO game_narrations'), rows: [] },
      {
        match: (text) => text.includes("SET status = 'processing'"),
        rows: [{ gameId: 'game-2' }],
      },
      {
        match: (text) => text.includes('FROM games'),
        rows: [{ result: 'draw', termination: 'agreement', timeControl: 'Rápida 10+0' }],
      },
      {
        match: (text) => text.includes('FROM game_move_analyses'),
        rows: [
          {
            bestMoveUci: null,
            centipawnLoss: 400,
            color: 'white',
            fenBefore: 'FEN_X',
            missedWin: false,
            ply: 5,
            quality: 'gafe',
            san: 'Qxd5',
            uci: 'd1d5',
          },
        ],
      },
      { match: (text) => text.includes('FROM move_narration_cache'), rows: [] },
      { match: (text) => text.includes("SET status = 'failed'"), rows: [] },
    ]);

    const result = await runGameNarrationJob(sql);

    expect(result).toEqual({ narratedGameId: 'game-2' });
    const failedCall = calls.find((call) => call.text.includes("SET status = 'failed'"));
    expect(failedCall?.values).toContain('anthropic api down');
  });
});
