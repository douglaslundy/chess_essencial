import postgres from 'postgres';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DatabaseService } from '../database/database.service.js';
import { BackupService } from './backup.service.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

// Runs on its own CI step: a restore truncates and reloads the whole database.
// The CI database carries the full seed (30k library games, exercises…): allow real time.
describeDatabase('platform backup round trip', { timeout: 120_000 }, () => {
  let sql: ReturnType<typeof postgres>;
  let service: BackupService;

  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });
    service = new BackupService({ client: sql } as unknown as DatabaseService);
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  async function exportToBuffer(): Promise<Buffer> {
    const { stream } = await service.export('00000000-0000-4000-8000-000000000000');
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }

  it('restores exactly the exported data, ids and sequences included', async () => {
    const [before] = await sql<{ users: number; games: number; exercises: number }[]>`
      SELECT (SELECT count(*)::integer FROM users) AS users,
        (SELECT count(*)::integer FROM games) AS games,
        (SELECT count(*)::integer FROM exercises) AS exercises
    `;
    const backup = await exportToBuffer();

    await sql`DELETE FROM exercises WHERE id IN (SELECT id FROM exercises LIMIT 5)`;
    const report = await service.restore(
      Readable.from(backup),
      '00000000-0000-4000-8000-000000000000',
    );

    const [after] = await sql<{ users: number; games: number; exercises: number }[]>`
      SELECT (SELECT count(*)::integer FROM users) AS users,
        (SELECT count(*)::integer FROM games) AS games,
        (SELECT count(*)::integer FROM exercises) AS exercises
    `;
    expect(after).toEqual(before);
    expect(report.tables).toBeGreaterThan(10);
    expect(report.rows).toBeGreaterThan(0);
  });

  it('refuses a file that is not a platform backup, changing nothing', async () => {
    const countUsers = async () =>
      (await sql<{ count: number }[]>`SELECT count(*)::integer AS count FROM users`)[0]?.count;
    const before = await countUsers();
    await expect(
      service.restore(
        Readable.from(Buffer.from('not a backup')),
        '00000000-0000-4000-8000-000000000000',
      ),
    ).rejects.toThrow();
    expect(await countUsers()).toBe(before);
  });
});
