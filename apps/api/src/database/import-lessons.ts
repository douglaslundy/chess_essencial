import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import { normalizeLessonDataset, persistLessonDataset } from '../courses/lesson-importer.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const publish = args.includes('--publish');
const strict = args.includes('--strict');
const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const sourcePath = resolve(
  repositoryRoot,
  args.find((argument) => !argument.startsWith('--')) ??
    'database/content/Xadrez_Essencial_Aulas_1_a_119.json',
);
const raw = await readFile(sourcePath, 'utf8');
const dataset = normalizeLessonDataset(JSON.parse(raw) as unknown, basename(sourcePath));
if (strict && (dataset.statistics.lessonCount !== 119 || dataset.statistics.moduleCount !== 10))
  throw new Error('Strict lesson import requires 119 lessons across 10 modules');

if (dryRun) {
  process.stdout.write(
    `${JSON.stringify({ ...dataset.statistics, published: publish, sourceName: dataset.sourceName }, null, 2)}\n`,
  );
} else {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required unless --dry-run is used');
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const report = await persistLessonDataset(sql, dataset, { publish });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
