import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import {
  normalizeExerciseDataset,
  persistExerciseDataset,
} from '../exercises/exercise-importer.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const strict = args.includes('--strict');
const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const sourcePath = resolve(
  repositoryRoot,
  args.find((argument) => !argument.startsWith('--')) ??
    'Xadrez_Essencial_Exercicios_1_a_1298.json',
);
const raw = await readFile(sourcePath, 'utf8');
const dataset = normalizeExerciseDataset(JSON.parse(raw) as unknown, basename(sourcePath));

if (strict && dataset.report.rejected > 0) {
  throw new Error('Strict import rejected one or more exercises');
}

if (dryRun) {
  process.stdout.write(`${JSON.stringify(dataset.report, null, 2)}\n`);
} else {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required unless --dry-run is used');
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const report = await persistExerciseDataset(sql, dataset);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
