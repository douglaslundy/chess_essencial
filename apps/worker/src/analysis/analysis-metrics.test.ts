import { beforeEach, describe, expect, it } from 'vitest';

import {
  ANALYSIS_LEASE_MS,
  getAnalysisMetricsSnapshot,
  recordEngineEvaluation,
  recordGameAnalysis,
  recordGameNarration,
  resetAnalysisMetricsForTests,
} from './analysis-metrics.js';

function gameMetric(durationMs: number) {
  return {
    cpuMs: durationMs / 2,
    depth: 14,
    durationMs,
    memoryCurrentBytes: 128 * 1024 * 1024,
    memoryPeakBytes: 160 * 1024 * 1024,
    outcome: 'completed' as const,
    positionsEvaluated: 81,
    resourceScope: 'cgroup-v2' as const,
  };
}

describe('analysis metrics', () => {
  beforeEach(() => resetAnalysisMetricsForTests());

  it('reports bounded latency percentiles for engine positions and games', () => {
    for (const duration of [10, 20, 30, 40, 50]) recordEngineEvaluation(duration);
    for (const duration of [100, 200, 300, 400, 500]) recordGameAnalysis(gameMetric(duration));

    const snapshot = getAnalysisMetricsSnapshot();

    expect(snapshot.engineEvaluationDurationMs).toMatchObject({
      count: 5,
      max: 50,
      p50: 30,
      p95: 50,
      p99: 50,
    });
    expect(snapshot.gameAnalysisDurationMs).toMatchObject({ count: 5, p99: 500 });
    expect(snapshot.analysisHeartbeatDecision).toBe('insufficient_samples');
    expect(snapshot.narrationHeartbeatDecision).toBe('insufficient_samples');
  });

  it('requires enough observations and half-lease headroom before recommending no heartbeat', () => {
    for (let index = 0; index < 20; index += 1) {
      recordGameAnalysis(gameMetric(ANALYSIS_LEASE_MS / 4));
    }
    expect(getAnalysisMetricsSnapshot().analysisHeartbeatDecision).toBe('not_required');

    resetAnalysisMetricsForTests();
    for (let index = 0; index < 20; index += 1) {
      recordGameAnalysis(gameMetric(ANALYSIS_LEASE_MS / 2));
    }
    expect(getAnalysisMetricsSnapshot().analysisHeartbeatDecision).toBe('required');
  });

  it('tracks the narration lease independently from Stockfish analysis', () => {
    for (let index = 0; index < 20; index += 1) recordGameNarration(30_000);

    const snapshot = getAnalysisMetricsSnapshot();

    expect(snapshot.narrationDurationMs).toMatchObject({ count: 20, p99: 30_000 });
    expect(snapshot.narrationHeartbeatDecision).toBe('not_required');
  });
});
