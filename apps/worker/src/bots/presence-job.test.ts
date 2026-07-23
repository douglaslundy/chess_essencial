import { describe, expect, it } from 'vitest';

import { runPresenceSchedule } from './presence-job.js';

interface FakeRow {
  onlineWindows: unknown;
  userId: string;
}

function fakeSql(rows: FakeRow[]) {
  return (() => Promise.resolve(rows)) as never;
}

function fakePipeline() {
  const calls: { args: unknown[]; op: 'set' | 'del' }[] = [];
  const pipeline = {
    del: (...args: unknown[]) => {
      calls.push({ args, op: 'del' });
      return pipeline;
    },
    exec: () => Promise.resolve(calls.map(() => [null, 1])),
    set: (...args: unknown[]) => {
      calls.push({ args, op: 'set' });
      return pipeline;
    },
  };
  return { calls, pipeline };
}

describe('runPresenceSchedule', () => {
  it('sets presence with a 90s TTL for bots inside their window and clears the rest', async () => {
    const { calls, pipeline } = fakePipeline();
    const redis = { pipeline: () => pipeline } as never;
    const sql = fakeSql([
      { onlineWindows: [{ endMinute: 700, startMinute: 600 }], userId: 'online-bot' },
      { onlineWindows: [{ endMinute: 100, startMinute: 0 }], userId: 'offline-bot' },
    ]);
    // 650 minutes since UTC midnight = 10:50 UTC.
    const now = new Date(Date.UTC(2026, 0, 1, 10, 50));

    const summary = await runPresenceSchedule(sql, redis, now);

    expect(summary).toEqual({ offline: 1, online: 1 });
    expect(calls).toEqual([
      { args: ['presence:online-bot', '1', 'EX', 90], op: 'set' },
      { args: ['presence:offline-bot'], op: 'del' },
    ]);
  });

  it('parses online_windows when the driver returns it as a JSON string', async () => {
    const { calls, pipeline } = fakePipeline();
    const redis = { pipeline: () => pipeline } as never;
    const sql = fakeSql([
      { onlineWindows: JSON.stringify([{ endMinute: 700, startMinute: 600 }]), userId: 'bot-1' },
    ]);
    const now = new Date(Date.UTC(2026, 0, 1, 10, 50));

    await runPresenceSchedule(sql, redis, now);

    expect(calls).toEqual([{ args: ['presence:bot-1', '1', 'EX', 90], op: 'set' }]);
  });

  it('does nothing when there are no bot personas', async () => {
    const { calls, pipeline } = fakePipeline();
    const redis = { pipeline: () => pipeline } as never;
    const sql = fakeSql([]);

    const summary = await runPresenceSchedule(sql, redis, new Date());

    expect(summary).toEqual({ offline: 0, online: 0 });
    expect(calls).toEqual([]);
  });
});
