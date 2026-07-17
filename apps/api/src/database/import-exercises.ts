import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import postgres from 'postgres';

import {
  normalizeExerciseDataset,
  persistExerciseDataset,
} from '../exercises/exercise-importer.js';

const sourcePath = resolve(process.argv[2] ?? 'Xadrez_Essencial_Exercicios_1_a_1298.json');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const raw = await readFile(sourcePath, 'utf8');
const dataset = normalizeExerciseDataset(JSON.parse(raw) as unknown, basename(sourcePath));
const sql = postgres(databaseUrl, { max: 1, prepare: false });

try {
  const report = await persistExerciseDataset(sql, dataset);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await sql.end({ timeout: 5 });
}
