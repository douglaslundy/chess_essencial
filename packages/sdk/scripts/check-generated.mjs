import console from 'node:console';
import process from 'node:process';
import { URL } from 'node:url';
import { readFile, rm } from 'node:fs/promises';

const temporary = new URL('../.generated-openapi.tmp.ts', import.meta.url);
const committed = new URL('../src/generated/openapi.ts', import.meta.url);

try {
  const [actual, expected] = await Promise.all([
    readFile(temporary, 'utf8'),
    readFile(committed, 'utf8'),
  ]);
  if (actual !== expected) {
    console.error('Generated OpenAPI types are stale. Run pnpm --filter @xadrez/sdk generate:api.');
    process.exitCode = 1;
  }
} finally {
  await rm(temporary, { force: true });
}
