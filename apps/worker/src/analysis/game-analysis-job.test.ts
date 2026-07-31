import { describe, expect, it, vi } from 'vitest';

import type { EngineEvaluation } from '../engine/stockfish-engine.js';

const evaluatePosition = vi.hoisted(() => vi.fn());
vi.mock('../engine/stockfish-engine.js', () => ({ evaluatePosition }));

const { runGameAnalysisJob } = await import('./game-analysis-job.js');

interface Call {
  text: string;
  values: unknown[];
}

function fakeSql(handlers: { match: (text: string) => boolean; rows: unknown }[]) {
  const calls: Call[] = [];
  const fn = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join(' ? ');
    calls.push({ text, values });
    const handler = handlers.find((entry) => entry.match(text));
    return Promise.resolve(handler ? handler.rows : []);
  }) as never;
  return { calls, sql: fn };
}

function evaluation(overrides: Partial<EngineEvaluation> = {}): EngineEvaluation {
  return { bestMove: 'e2e4', mate: null, pv: [], scoreCp: 20, ...overrides };
}

describe('runGameAnalysisJob', () => {
  it('does nothing when no analysis is pending', async () => {
    const { calls, sql } = fakeSql([]);

    const result = await runGameAnalysisJob(sql);

    expect(result).toEqual({ analyzedGameId: null });
    expect(evaluatePosition).not.toHaveBeenCalled();
    const exhausted = calls.find((call) =>
      call.text.includes("SET completed_at = now(), status = 'failed'"),
    );
    expect(exhausted?.values).toContain(3);
    const claim = calls.find((call) => call.text.includes("SET status = 'processing'"));
    expect(claim?.text).toContain('lease_expires_at IS NULL');
    expect(claim?.text).toContain('attempt_count = target.attempt_count + 1');
    expect(claim?.values).toContain(30);
  });

  it('analyzes every ply of the claimed game and marks it completed', async () => {
    evaluatePosition.mockReset();
    evaluatePosition
      .mockResolvedValueOnce(evaluation({ bestMove: 'e2e4', scoreCp: 20 })) // start position, white to move
      .mockResolvedValueOnce(evaluation({ bestMove: 'e7e5', scoreCp: 15 })) // after 1.e4, black to move, roughly fine for black
      .mockResolvedValueOnce(evaluation({ bestMove: null, mate: 1, scoreCp: null })); // after black's reply, white (to move) has forced mate — black blundered

    const { calls, sql } = fakeSql([
      { match: (text) => text.includes('INSERT INTO game_analyses'), rows: [] },
      {
        match: (text) => text.includes("SET status = 'processing'"),
        rows: [{ attemptCount: 1, engineDepth: 14, gameId: 'game-1' }],
      },
      {
        match: (text) => text.includes('FROM game_moves'),
        rows: [
          { color: 'white', fenAfter: 'FEN_AFTER_1', fenBefore: 'FEN_START', ply: 1 },
          { color: 'black', fenAfter: 'FEN_AFTER_2', fenBefore: 'FEN_AFTER_1', ply: 2 },
        ],
      },
      { match: (text) => text.includes('INSERT INTO game_move_analyses'), rows: [] },
      { match: (text) => text.includes("SET status = 'completed'"), rows: [] },
    ]);

    const result = await runGameAnalysisJob(sql);

    expect(result).toEqual({ analyzedGameId: 'game-1' });
    expect(evaluatePosition).toHaveBeenCalledTimes(3);
    expect(evaluatePosition).toHaveBeenNthCalledWith(1, 'FEN_START', { depth: 14 });
    expect(evaluatePosition).toHaveBeenNthCalledWith(2, 'FEN_AFTER_1', { depth: 14 });
    expect(evaluatePosition).toHaveBeenNthCalledWith(3, 'FEN_AFTER_2', { depth: 14 });

    // Black's move let white deliver a forced mate — a textbook gafe. The
    // raw engine score for the resulting position is from white's
    // perspective (mate: 1, white to move); classifyMove needs it negated
    // to black's perspective (mate: -1, black about to get mated) to grade
    // black's move correctly.
    const moveAnalysisCalls = calls.filter((call) =>
      call.text.includes('INSERT INTO game_move_analyses'),
    );
    expect(moveAnalysisCalls[1]?.values).toContain('gafe');

    expect(calls.some((call) => call.text.includes("SET status = 'completed'"))).toBe(true);
  });

  it('returns a transient engine failure to pending with bounded backoff', async () => {
    evaluatePosition.mockReset();
    evaluatePosition.mockRejectedValueOnce(new Error('temporary engine failure'));

    const { calls, sql } = fakeSql([
      { match: (text) => text.includes('INSERT INTO game_analyses'), rows: [] },
      {
        match: (text) => text.includes("SET status = 'processing'"),
        rows: [{ attemptCount: 1, engineDepth: 14, gameId: 'game-retry' }],
      },
      {
        match: (text) => text.includes('FROM game_moves'),
        rows: [{ color: 'white', fenAfter: 'FEN_AFTER', fenBefore: 'FEN_START', ply: 1 }],
      },
      { match: (text) => text.includes("SET status = 'pending'"), rows: [] },
    ]);

    expect(await runGameAnalysisJob(sql)).toEqual({ analyzedGameId: 'game-retry' });
    const retry = calls.find((call) => call.text.includes("SET status = 'pending'"));
    expect(retry?.values).toContain('temporary engine failure');
    expect(retry?.values).toContain(1);
    expect(calls.some((call) => call.text.includes("SET status = 'failed'"))).toBe(false);
  });

  it('marks the analysis as failed instead of leaving it stuck if the engine throws', async () => {
    evaluatePosition.mockReset();
    evaluatePosition.mockRejectedValueOnce(new Error('engine crashed'));

    const { calls, sql } = fakeSql([
      { match: (text) => text.includes('INSERT INTO game_analyses'), rows: [] },
      {
        match: (text) => text.includes("SET status = 'processing'"),
        rows: [{ attemptCount: 3, engineDepth: 14, gameId: 'game-2' }],
      },
      {
        match: (text) => text.includes('FROM game_moves'),
        rows: [{ color: 'white', fenAfter: 'FEN_AFTER_1', fenBefore: 'FEN_START', ply: 1 }],
      },
      { match: (text) => text.includes("SET status = 'failed'"), rows: [] },
    ]);

    const result = await runGameAnalysisJob(sql);

    expect(result).toEqual({ analyzedGameId: 'game-2' });
    const failedCall = calls.find((call) => call.text.includes("SET status = 'failed'"));
    expect(failedCall?.values).toContain('engine crashed');
  });
});
