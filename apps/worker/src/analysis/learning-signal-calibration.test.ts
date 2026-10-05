import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const report = readFileSync(
  new URL('../../../../scripts/learning-signal-calibration.sql', import.meta.url),
  'utf8',
);

describe('learning signal calibration report', () => {
  it('runs in a read-only transaction', () => {
    expect(report).toContain('BEGIN TRANSACTION READ ONLY');
    expect(report.trimEnd()).toMatch(/ROLLBACK;$/);
  });

  it('measures objective themes, usefulness by difficulty, latency and diversity', () => {
    expect(report).toContain(`evidence->>'detectedTheme'`);
    expect(report).toContain('difficulty_band');
    expect(report).toContain(`interval '30 days'`);
    expect(report).toContain('attempt.attempted_at');
    expect(report).not.toContain('attempt.created_at');
    expect(report).toContain('median_hours_to_attempt');
    expect(report).toContain('top_five_exercise_share');
    expect(report).toContain('effective_exercise_count');
    expect(report).toContain('repeated_recommendation_rate');
  });
});
