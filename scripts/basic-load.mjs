import { performance } from 'node:perf_hooks';

const target = process.env.LOAD_TEST_URL ?? 'http://127.0.0.1:4000/v1/health';
const requestCount = Number.parseInt(process.env.LOAD_TEST_REQUESTS ?? '80', 10);
const concurrency = Number.parseInt(process.env.LOAD_TEST_CONCURRENCY ?? '8', 10);
const maxP95Ms = Number.parseInt(process.env.LOAD_TEST_MAX_P95_MS ?? '500', 10);

if (![requestCount, concurrency, maxP95Ms].every(Number.isFinite) || requestCount < 1) {
  throw new Error('Invalid load test configuration');
}

const durations = [];
let nextRequest = 0;
let failures = 0;

async function worker() {
  while (nextRequest < requestCount) {
    nextRequest += 1;
    const startedAt = performance.now();
    try {
      const response = await fetch(target, { headers: { accept: 'application/json' } });
      if (!response.ok) failures += 1;
      await response.arrayBuffer();
    } catch {
      failures += 1;
    } finally {
      durations.push(performance.now() - startedAt);
    }
  }
}

const suiteStartedAt = performance.now();
await Promise.all(Array.from({ length: Math.min(concurrency, requestCount) }, worker));
const elapsedMs = performance.now() - suiteStartedAt;
durations.sort((left, right) => left - right);
const p95Index = Math.max(0, Math.ceil(durations.length * 0.95) - 1);
const p95Ms = durations[p95Index] ?? Number.POSITIVE_INFINITY;
const requestsPerSecond = (requestCount / elapsedMs) * 1_000;

process.stdout.write(
  [
    `load.target=${target}`,
    `load.requests=${requestCount}`,
    `load.failures=${failures}`,
    `load.p95_ms=${p95Ms.toFixed(2)}`,
    `load.requests_per_second=${requestsPerSecond.toFixed(2)}`,
  ].join('\n') + '\n',
);

if (failures > 0 || p95Ms > maxP95Ms) process.exitCode = 1;
