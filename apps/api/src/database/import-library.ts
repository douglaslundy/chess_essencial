import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import postgres from 'postgres';

interface DatasetRow {
  b: string;
  be: number | null;
  d: string | null;
  eco: string | null;
  ev: string | null;
  k: string;
  m: string;
  n: number;
  op: string | null;
  r: string | null;
  res: string;
  si: string | null;
  w: string;
  we: number | null;
  y: number | null;
}

const BATCH = 500;
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const sourcePath = resolve(
  repositoryRoot,
  args.find((argument) => !argument.startsWith('--')) ?? 'database/content/library/games.jsonl.gz',
);
const rows = gunzipSync(await readFile(sourcePath))
  .toString('utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line) as DatasetRow);

if (dryRun) {
  process.stdout.write(`${JSON.stringify({ total: rows.length })}\n`);
} else {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required unless --dry-run is used');
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH).map((r) => ({
        black: r.b,
        black_elo: r.be,
        eco: r.eco,
        event: r.ev,
        external_key: r.k,
        moves_san: r.m,
        opening_family: r.op ? r.op.split(':')[0]! : null,
        opening_name: r.op,
        played_on: r.d,
        played_year: r.y,
        ply_count: r.n,
        result: r.res,
        round: r.r,
        site: r.si,
        white: r.w,
        white_elo: r.we,
      }));
      const result = await sql`
        INSERT INTO library_games ${sql(batch)} ON CONFLICT (external_key) DO NOTHING
      `;
      inserted += result.count;
    }
    process.stdout.write(`${JSON.stringify({ inserted, total: rows.length })}\n`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
