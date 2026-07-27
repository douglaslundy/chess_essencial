import { describe, expect, it } from 'vitest';

import { runExpireTimedOutGamesJob } from './expire-timed-out-games-job.js';

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
  }) as unknown as { begin: (callback: (tx: unknown) => Promise<unknown>) => Promise<unknown> };
  fn.begin = (callback) => callback(fn);
  return { calls, sql: fn as never };
}

const NOW = new Date('2026-07-26T12:00:00.000Z');

describe('runExpireTimedOutGamesJob', () => {
  it('does nothing when no active game has an expired clock', async () => {
    const { sql } = fakeSql([
      {
        match: (text) => text.includes('FROM games') && text.includes("status = 'active'"),
        rows: [
          {
            activeClockStartedAt: new Date('2026-07-26T11:59:50.000Z'),
            blackClockMs: 60_000,
            delayMs: 0,
            id: 'game-1',
            sideToMove: 'white',
            whiteClockMs: 60_000,
          },
        ],
      },
    ]);

    const result = await runExpireTimedOutGamesJob(sql, NOW);

    expect(result).toEqual({ expiredGameIds: [] });
  });

  it('finalizes a game whose clock ran out, crediting the win to the side that was not on the clock', async () => {
    const { calls, sql } = fakeSql([
      {
        match: (text) => text.includes('FROM games') && text.includes("status = 'active'"),
        rows: [
          {
            activeClockStartedAt: new Date('2026-07-26T11:00:00.000Z'),
            blackClockMs: 60_000,
            delayMs: 0,
            id: 'game-1',
            sideToMove: 'white',
            whiteClockMs: 1_000,
          },
        ],
      },
      {
        match: (text) => text.includes('SELECT') && text.includes('games.status'),
        rows: [
          {
            activeClockStartedAt: new Date('2026-07-26T11:00:00.000Z'),
            blackClockMs: 60_000,
            delayMs: 0,
            initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            sideToMove: 'white',
            status: 'active',
            whiteClockMs: 1_000,
          },
        ],
      },
      { match: (text) => text.includes('clock_timestamp'), rows: [{ now: NOW }] },
      { match: (text) => text.includes('FROM game_moves'), rows: [] },
      { match: (text) => text.includes('UPDATE games'), rows: [] },
      { match: (text) => text.includes('INSERT INTO outbox_events'), rows: [] },
      { match: (text) => text.includes('INSERT INTO game_pgn'), rows: [] },
    ]);

    const result = await runExpireTimedOutGamesJob(sql, NOW);

    expect(result).toEqual({ expiredGameIds: ['game-1'] });
    const update = calls.find((call) => call.text.includes('UPDATE games'));
    expect(update?.text).toContain("termination = 'timeout'");
    expect(update?.values).toContain('black_win');
  });

  it('re-checks under the lock and skips a game that was already finished by the time it runs', async () => {
    const { calls, sql } = fakeSql([
      {
        match: (text) => text.includes('FROM games') && text.includes("status = 'active'"),
        rows: [
          {
            activeClockStartedAt: new Date('2026-07-26T11:00:00.000Z'),
            blackClockMs: 60_000,
            delayMs: 0,
            id: 'game-1',
            sideToMove: 'white',
            whiteClockMs: 1_000,
          },
        ],
      },
      {
        // The gateway's own timer already finished it first — this re-fetch
        // (inside the advisory lock) sees status='finished' now.
        match: (text) => text.includes('SELECT') && text.includes('games.status'),
        rows: [{ status: 'finished' }],
      },
    ]);

    const result = await runExpireTimedOutGamesJob(sql, NOW);

    expect(result).toEqual({ expiredGameIds: [] });
    expect(calls.some((call) => call.text.includes('UPDATE games'))).toBe(false);
  });
});
