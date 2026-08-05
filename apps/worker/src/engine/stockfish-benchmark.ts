import { performance } from 'node:perf_hooks';

import {
  ANALYSIS_LEASE_MS,
  finishRuntimeResourceMeasurement,
  startRuntimeResourceMeasurement,
  STOCKFISH_HASH_MB,
  STOCKFISH_THREADS,
  WORKER_CPU_BUDGET_CORES,
  WORKER_MEMORY_BUDGET_BYTES,
} from '../analysis/analysis-metrics.js';
import { evaluatePosition } from './stockfish-engine.js';

const DEPTH = 14;
const ITERATIONS = 5;
const REPRESENTATIVE_FENS = [
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
  'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 6 5',
  'r3k2r/p1ppqpb1/bn2pnp1/2pP4/1p2P3/2N2N2/PPQ1BPPP/R1B1K2R w KQkq - 0 1',
  '8/5pk1/6p1/7p/5P1P/6P1/5K2/8 w - - 0 1',
  '6k1/5ppp/8/8/8/8/8/R6K w - - 0 1',
];

function percentile(sorted: number[], ratio: number): number {
  const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1);
  return Math.round(sorted[index]! * 100) / 100;
}

const durationsMs: number[] = [];
const resourceStart = await startRuntimeResourceMeasurement();
const benchmarkStartedAt = performance.now();

for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
  for (const fen of REPRESENTATIVE_FENS) {
    const startedAt = performance.now();
    await evaluatePosition(fen, { depth: DEPTH });
    durationsMs.push(performance.now() - startedAt);
  }
}

const resources = await finishRuntimeResourceMeasurement(resourceStart);
const totalDurationMs = performance.now() - benchmarkStartedAt;
const sorted = [...durationsMs].sort((left, right) => left - right);
const p99PositionMs = percentile(sorted, 0.99);
// A 60-move game requires 121 evaluations (initial position plus 120 plies).
// Multiplying every position by the observed p99 is deliberately conservative.
const conservativeSixtyMoveGameMs = p99PositionMs * 121;

console.log(
  JSON.stringify(
    {
      budget: {
        analysisLeaseMs: ANALYSIS_LEASE_MS,
        stockfishHashMb: STOCKFISH_HASH_MB,
        stockfishThreads: STOCKFISH_THREADS,
        workerCpuCores: WORKER_CPU_BUDGET_CORES,
        workerMemoryBytes: WORKER_MEMORY_BUDGET_BYTES,
      },
      depth: DEPTH,
      durationMs: {
        max: Math.round(sorted.at(-1)! * 100) / 100,
        p50: percentile(sorted, 0.5),
        p95: percentile(sorted, 0.95),
        p99: p99PositionMs,
        total: Math.round(totalDurationMs * 100) / 100,
      },
      evaluations: durationsMs.length,
      evaluationsPerSecond: Math.round((durationsMs.length / totalDurationMs) * 100_000) / 100,
      leaseProjection: {
        conservativeSixtyMoveGameMs,
        leaseUtilizationPercent:
          Math.round((conservativeSixtyMoveGameMs / ANALYSIS_LEASE_MS) * 10_000) / 100,
      },
      resources,
    },
    null,
    2,
  ),
);
