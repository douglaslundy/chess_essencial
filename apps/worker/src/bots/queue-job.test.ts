import { describe, expect, it } from 'vitest';

import { pickTimeControlForBot, runBotQueueJob } from './queue-job.js';

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

function countedDelete(count: number) {
  return Object.assign([], { count });
}

describe('runBotQueueJob', () => {
  it('does nothing when there are no bot personas', async () => {
    const { calls, sql } = fakeSql([{ match: (text) => text.includes('bot_personas'), rows: [] }]);
    let mgetCalled = false;
    const redis = { mget: () => ((mgetCalled = true), Promise.resolve([])) } as never;

    const summary = await runBotQueueJob(sql, redis, new Date());

    expect(summary).toEqual({ queued: 0, removed: 0 });
    expect(mgetCalled).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('queues online idle bots and removes offline/busy ones from the queue', async () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    const { sql } = fakeSql([
      {
        match: (text) => text.includes('FROM bot_personas'),
        rows: [
          { targetRating: 1200, userId: 'bot-online-idle' },
          { targetRating: 1400, userId: 'bot-online-busy' },
          { targetRating: 1600, userId: 'bot-offline' },
        ],
      },
      {
        match: (text) => text.includes('FROM game_players'),
        rows: [{ userId: 'bot-online-busy' }],
      },
      {
        match: (text) => text.includes('DELETE FROM matchmaking_queue'),
        rows: countedDelete(2),
      },
      {
        match: (text) => text.includes('FROM game_time_controls'),
        rows: [{ id: 'tc-blitz', pool: 'blitz' }],
      },
      {
        match: (text) => text.includes('FROM rating_profiles'),
        rows: [{ rating: 1250 }],
      },
      {
        match: (text) => text.includes('INSERT INTO matchmaking_queue'),
        rows: [],
      },
    ]);
    const redis = {
      mget: (keys: string[]) =>
        Promise.resolve(
          keys.map((key) =>
            key === 'presence:bot-online-idle' || key === 'presence:bot-online-busy' ? '1' : null,
          ),
        ),
    } as never;

    const summary = await runBotQueueJob(sql, redis, now);

    expect(summary).toEqual({ queued: 1, removed: 2 });
  });

  it('does nothing further when no bot is both online and idle', async () => {
    const { sql } = fakeSql([
      {
        match: (text) => text.includes('FROM bot_personas'),
        rows: [{ targetRating: 1200, userId: 'bot-offline' }],
      },
      {
        match: (text) => text.includes('DELETE FROM matchmaking_queue'),
        rows: countedDelete(1),
      },
    ]);
    const redis = { mget: () => Promise.resolve([null]) } as never;

    const summary = await runBotQueueJob(sql, redis, new Date());

    expect(summary).toEqual({ queued: 0, removed: 1 });
  });
});

describe('pickTimeControlForBot', () => {
  const timeControls = [
    { id: 'a', pool: 'bullet' },
    { id: 'b', pool: 'blitz' },
    { id: 'c', pool: 'rapid' },
    { id: 'd', pool: 'classical' },
  ];

  it('is deterministic for the same bot', () => {
    const first = pickTimeControlForBot('bot-123', timeControls);
    const second = pickTimeControlForBot('bot-123', timeControls);
    expect(first).toEqual(second);
  });

  it('always picks a control from the given list', () => {
    for (const userId of ['bot-a', 'bot-b', 'bot-c', 'bot-d', 'bot-e']) {
      const picked = pickTimeControlForBot(userId, timeControls);
      expect(timeControls).toContainEqual(picked);
    }
  });
});
