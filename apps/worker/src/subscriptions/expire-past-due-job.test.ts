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

  // Bug 2: `expired` was already an allowed subscription_payments.status
  // value (CHECK constraint) but nothing ever wrote it — the ledger went
  // silently incomplete for every subscription that lapsed instead of
  // renewing. The job must log a matching ledger row per subscription it
  // expires, the same idempotent (ON CONFLICT) shape as the rest of the
  // ledger, and include a raw payload (bug 3) even though this isn't a
  // Mercado Pago webhook.
  it('logs an expired ledger row for every subscription it flips, idempotently', async () => {
    const { calls, sql } = fakeSql([{ id: 'sub-1' }]);

    await runExpirePastDueJob(sql);

    const text = calls[0]?.text ?? '';
    expect(text).toContain('INSERT INTO subscription_payments');
    expect(text).toContain("'expired'");
    expect(text).toContain('raw_notification');
    expect(text).toContain('ON CONFLICT');
    expect(text).toContain('DO NOTHING');
  });
});
