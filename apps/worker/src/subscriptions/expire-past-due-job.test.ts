import { describe, expect, it } from 'vitest';

import { runExpirePastDueJob } from './expire-past-due-job.js';

function fakeSql(rows: unknown) {
  const calls: { text: string }[] = [];
  const fn = ((strings: TemplateStringsArray) => {
    calls.push({ text: strings.join(' ? ') });
    return Promise.resolve(rows);
  }) as never;
  return { calls, sql: fn };
}

describe('runExpirePastDueJob', () => {
  it('reports how many subscriptions were flipped to expired', async () => {
    const { calls, sql } = fakeSql([{ id: 'sub-1' }, { id: 'sub-2' }]);

    const result = await runExpirePastDueJob(sql);

    expect(result).toEqual({ expiredCount: 2 });
    expect(calls[0]?.text).toContain("status = 'expired'");
  });

  it('reports zero when nothing is past due', async () => {
    const { sql } = fakeSql([]);

    const result = await runExpirePastDueJob(sql);

    expect(result).toEqual({ expiredCount: 0 });
  });
});
