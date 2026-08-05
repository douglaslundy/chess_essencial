import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExercisesService } from '../exercises/exercises.service.js';
import type { LessonRuntimeService } from '../lesson-runtime/lesson-runtime.service.js';
import type { LearningPathRepository } from './learning-path.repository.js';
import { LearningPathService } from './learning-path.service.js';

const context = {
  allowedThemes: null,
  exerciseId: 'exercise-1',
  id: 'stage-1',
  lessonId: null,
  levelDifficultyMax: 1000,
  levelDifficultyMin: 0,
  levelId: 'level-1',
  type: 'challenge' as const,
  worldId: 'world-1',
};

const availableCompletion = {
  correctFirstTry: null,
  hintsUsed: 0,
  lessonAttemptId: null,
  resolvedExerciseId: null,
  startedAt: '2026-08-05T12:00:00.000Z',
  status: 'available' as const,
  trainingSessionId: 'training-1',
};

describe('LearningPathService completion semantics', () => {
  const repository = {
    addXp: vi.fn(),
    advanceProgressPastLevel: vi.fn(),
    awardBadge: vi.fn(),
    bumpStreak: vi.fn(),
    countAttemptsSince: vi.fn(),
    countCompletedStages: vi.fn(),
    getExerciseTags: vi.fn(),
    getOrInitProgress: vi.fn(),
    getOrStartCompletion: vi.fn(),
    getStageContext: vi.fn(),
    getWorldTitle: vi.fn(),
    isCapstoneLevel: vi.fn(),
    isLevelFullyCompleted: vi.fn(),
    isLevelPerfectFirstTry: vi.fn(),
    markStageCompleted: vi.fn(),
    upsertSkillMastery: vi.fn(),
  };
  const exercises = { getSessionHintsUsed: vi.fn() };
  const lessons = {};
  let service: LearningPathService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new LearningPathService(
      repository as unknown as LearningPathRepository,
      exercises as unknown as ExercisesService,
      lessons as unknown as LessonRuntimeService,
    );
    (
      service as unknown as {
        assertStageReachable: (userId: string, levelId: string, stageId: string) => Promise<void>;
      }
    ).assertStageReachable = vi.fn().mockResolvedValue(undefined);

    repository.getStageContext.mockResolvedValue(context);
    repository.getOrStartCompletion.mockResolvedValue(availableCompletion);
    repository.countAttemptsSince.mockResolvedValue({ failures: 0, successes: 1 });
    repository.getExerciseTags.mockResolvedValue([]);
    repository.isLevelFullyCompleted.mockResolvedValue(false);
    repository.bumpStreak.mockResolvedValue(1);
    repository.countCompletedStages.mockResolvedValue(2);
    repository.awardBadge.mockResolvedValue(false);
    exercises.getSessionHintsUsed.mockResolvedValue(0);
  });

  it('does not award first-try perfection when a hint was used', async () => {
    exercises.getSessionHintsUsed.mockResolvedValue(1);

    const result = await service.completeStage('user-1', 'stage-1');

    expect(result).toMatchObject({ correctFirstTry: false, hintsUsed: 1, xpAwarded: 10 });
    expect(repository.markStageCompleted).toHaveBeenCalledWith('user-1', 'stage-1', {
      correctFirstTry: false,
      hintsUsed: 1,
    });
    expect(repository.addXp).toHaveBeenCalledWith('user-1', 10);
  });

  it('awards the first-try bonus only for an unaided solution', async () => {
    const result = await service.completeStage('user-1', 'stage-1');

    expect(result).toMatchObject({ correctFirstTry: true, hintsUsed: 0, xpAwarded: 15 });
    expect(repository.addXp).toHaveBeenCalledWith('user-1', 15);
  });

  it('returns the persisted historical conclusion without recalculating it', async () => {
    repository.getOrStartCompletion.mockResolvedValue({
      ...availableCompletion,
      correctFirstTry: false,
      hintsUsed: 1,
      status: 'completed',
    });
    repository.getOrInitProgress.mockResolvedValue({ streakDays: 4 });
    repository.isCapstoneLevel.mockResolvedValue(false);

    const result = await service.completeStage('user-1', 'stage-1');

    expect(result).toMatchObject({
      correctFirstTry: false,
      hintsUsed: 1,
      streakDays: 4,
      xpAwarded: 0,
    });
    expect(repository.markStageCompleted).not.toHaveBeenCalled();
  });
});
