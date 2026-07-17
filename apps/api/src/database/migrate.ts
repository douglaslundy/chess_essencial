import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const migrationsDirectory = fileURLToPath(
  new URL('../../../../database/migrations/', import.meta.url),
);
const sql = postgres(databaseUrl, { max: 1, prepare: false });

function checksum(contents: string) {
  return createHash('sha256').update(contents).digest('hex');
}

async function ensureMigrationsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS _xadrez_migrations (
      name text PRIMARY KEY,
      checksum_sha256 char(64) NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

async function migrateUp() {
  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.up.sql'))
    .sort();

  for (const file of files) {
    const contents = await readFile(
      new URL(`../../../../database/migrations/${file}`, import.meta.url),
      'utf8',
    );
    const digest = checksum(contents);
    const [applied] = await sql<{ checksum_sha256: string }[]>`
      SELECT checksum_sha256
      FROM _xadrez_migrations
      WHERE name = ${file}
    `;

    if (applied) {
      if (applied.checksum_sha256.trim() !== digest) {
        throw new Error(`Migration checksum mismatch: ${file}`);
      }
      continue;
    }

    await sql.begin(async (transaction) => {
      await transaction.unsafe(contents);
      await transaction`
        INSERT INTO _xadrez_migrations (name, checksum_sha256)
        VALUES (${file}, ${digest})
      `;
    });

    process.stdout.write(`migration.applied=${file}\n`);
  }
}

async function migrateDown() {
  const [last] = await sql<{ name: string }[]>`
    SELECT name
    FROM _xadrez_migrations
    ORDER BY applied_at DESC, name DESC
    LIMIT 1
  `;

  if (!last) {
    process.stdout.write('migration.rollback=none\n');
    return;
  }

  const downFile = last.name.replace(/\.up\.sql$/, '.down.sql');
  const contents = await readFile(
    new URL(`../../../../database/migrations/${downFile}`, import.meta.url),
    'utf8',
  );

  await sql.begin(async (transaction) => {
    await transaction.unsafe(contents);
    await transaction`DELETE FROM _xadrez_migrations WHERE name = ${last.name}`;
  });

  process.stdout.write(`migration.rolled_back=${last.name}\n`);
}

try {
  await ensureMigrationsTable();
  await sql`SELECT pg_advisory_lock(hashtext('xadrez_migrations'))`;
  try {
    if (process.argv[2] === 'down') {
      await migrateDown();
    } else {
      await migrateUp();
    }
  } finally {
    await sql`SELECT pg_advisory_unlock(hashtext('xadrez_migrations'))`;
  }
} finally {
  await sql.end({ timeout: 5 });
}
