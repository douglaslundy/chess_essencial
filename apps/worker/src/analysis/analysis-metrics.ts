import { readFile } from 'node:fs/promises';

const MAX_SAMPLES = 512;
const MIN_HEARTBEAT_DECISION_SAMPLES = 20;

export const ANALYSIS_LEASE_MS = 30 * 60 * 1_000;
export const NARRATION_LEASE_MS = 15 * 60 * 1_000;
export const STOCKFISH_HASH_MB = 16;
export const STOCKFISH_THREADS = 1;
export const WORKER_CPU_BUDGET_CORES = 1;
export const WORKER_MEMORY_BUDGET_BYTES = 512 * 1024 * 1024;

interface RuntimeResourceSnapshot {
  cpuUsageUsec: number;
  memoryCurrentBytes: number;
  memoryPeakBytes: number;
  scope: 'cgroup-v2' | 'worker-process';
}

export interface RuntimeResourceMeasurement {
  cpuMs: number;
  memoryCurrentBytes: number;
  memoryPeakBytes: number;
  scope: RuntimeResourceSnapshot['scope'];
}

interface GameMetric {
  cpuMs: number;
  depth: number;
  durationMs: number;
  memoryCurrentBytes: number;
  memoryPeakBytes: number;
  outcome: 'completed' | 'failed';
  positionsEvaluated: number;
  resourceScope: RuntimeResourceSnapshot['scope'];
}

interface Percentiles {
  count: number;
  max: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
}

const engineDurationsMs: number[] = [];
const gameMetrics: GameMetric[] = [];
const narrationDurationsMs: number[] = [];

function appendBounded<T>(target: T[], value: T): void {
  target.push(value);
  if (target.length > MAX_SAMPLES) target.shift();
}

function percentile(sorted: number[], ratio: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1);
  return Math.round(sorted[index]! * 100) / 100;
}

function summarize(values: number[]): Percentiles {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: sorted.length,
    max: sorted.length === 0 ? null : Math.round(sorted[sorted.length - 1]! * 100) / 100,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
  };
}

function parseCpuUsageUsec(cpuStat: string): number {
  const match = /^usage_usec\s+(\d+)$/m.exec(cpuStat);
  if (!match?.[1]) throw new Error('cgroup cpu.stat does not contain usage_usec');
  return Number(match[1]);
}

function parseByteCount(value: string): number {
  const trimmed = value.trim();
  return trimmed === 'max' ? 0 : Number(trimmed);
}

async function readRuntimeResourceSnapshot(): Promise<RuntimeResourceSnapshot> {
  try {
    const [cpuStat, memoryCurrent, memoryPeak] = await Promise.all([
      readFile('/sys/fs/cgroup/cpu.stat', 'utf8'),
      readFile('/sys/fs/cgroup/memory.current', 'utf8'),
      readFile('/sys/fs/cgroup/memory.peak', 'utf8'),
    ]);
    return {
      cpuUsageUsec: parseCpuUsageUsec(cpuStat),
      memoryCurrentBytes: parseByteCount(memoryCurrent),
      memoryPeakBytes: parseByteCount(memoryPeak),
      scope: 'cgroup-v2',
    };
  } catch {
    const usage = process.cpuUsage();
    const rss = process.memoryUsage.rss();
    return {
      cpuUsageUsec: usage.user + usage.system,
      memoryCurrentBytes: rss,
      memoryPeakBytes: rss,
      scope: 'worker-process',
    };
  }
}

export async function startRuntimeResourceMeasurement(): Promise<RuntimeResourceSnapshot> {
  return readRuntimeResourceSnapshot();
}

export async function finishRuntimeResourceMeasurement(
  started: RuntimeResourceSnapshot,
): Promise<RuntimeResourceMeasurement> {
  const finished = await readRuntimeResourceSnapshot();
  return {
    cpuMs: Math.max(0, finished.cpuUsageUsec - started.cpuUsageUsec) / 1_000,
    memoryCurrentBytes: finished.memoryCurrentBytes,
    memoryPeakBytes: Math.max(started.memoryPeakBytes, finished.memoryPeakBytes),
    scope: finished.scope,
  };
}

export function recordEngineEvaluation(durationMs: number): void {
  appendBounded(engineDurationsMs, durationMs);
}

export function recordGameAnalysis(
  metric: GameMetric,
): ReturnType<typeof getAnalysisMetricsSnapshot> {
  appendBounded(gameMetrics, metric);
  return getAnalysisMetricsSnapshot();
}

export function recordGameNarration(
  durationMs: number,
): ReturnType<typeof getAnalysisMetricsSnapshot> {
  appendBounded(narrationDurationsMs, durationMs);
  return getAnalysisMetricsSnapshot();
}

function heartbeatDecision(samples: Percentiles, leaseMs: number) {
  if (samples.count < MIN_HEARTBEAT_DECISION_SAMPLES) return 'insufficient_samples';
  return (samples.p99 ?? 0) >= leaseMs / 2 ? 'required' : 'not_required';
}

export function getAnalysisMetricsSnapshot() {
  const games = summarize(gameMetrics.map((metric) => metric.durationMs));
  const engine = summarize(engineDurationsMs);
  const narrations = summarize(narrationDurationsMs);
  const latest = gameMetrics.at(-1) ?? null;

  return {
    analysisHeartbeatDecision: heartbeatDecision(games, ANALYSIS_LEASE_MS),
    budget: {
      analysisLeaseMs: ANALYSIS_LEASE_MS,
      narrationLeaseMs: NARRATION_LEASE_MS,
      stockfishHashMb: STOCKFISH_HASH_MB,
      stockfishThreads: STOCKFISH_THREADS,
      workerCpuCores: WORKER_CPU_BUDGET_CORES,
      workerMemoryBytes: WORKER_MEMORY_BUDGET_BYTES,
    },
    engineEvaluationDurationMs: engine,
    gameAnalysisDurationMs: games,
    latest,
    narrationDurationMs: narrations,
    narrationHeartbeatDecision: heartbeatDecision(narrations, NARRATION_LEASE_MS),
    sampleLimit: MAX_SAMPLES,
  };
}

export function resetAnalysisMetricsForTests(): void {
  engineDurationsMs.length = 0;
  gameMetrics.length = 0;
  narrationDurationsMs.length = 0;
}
