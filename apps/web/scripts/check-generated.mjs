import console from 'node:console';
import process from 'node:process';
import { readFile, rm } from 'node:fs/promises';
import { URL } from 'node:url';

const temporary = new URL('../.generated-openapi.tmp.ts', import.meta.url);
const committed = new URL('../src/lib/api/openapi.d.ts', import.meta.url);

try {
  const [actual, expected] = await Promise.all([
    readFile(temporary, 'utf8'),
    readFile(committed, 'utf8'),
  ]);
  if (actual !== expected) {
    console.error(
      'Generated web OpenAPI types are stale. Run pnpm --filter @xadrez/web generate:api.',
    );
    process.exitCode = 1;
  }
} finally {
  await rm(temporary, { force: true });
}
