import type {
  CompleteLearningStageResult,
  LearningBadge,
  LearningLevelDetail,
  LearningLevelStatus,
  LearningMap,
  LearningProgress,
  LearningStageStatus,
  StartLearningStageResult,
} from '@xadrez/contracts';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { ExercisesService } from '../exercises/exercises.service.js';
import { LearningPathRepository } from './learning-path.repository.js';

@Injectable()
export class LearningPathService {
  constructor(
    private readonly repository: LearningPathRepository,
    private readonly exercises: ExercisesService,
  ) {}

  private levelStatus(rank: number, highestUnlockedRank: number | null): LearningLevelStatus {
    if (highestUnlockedRank === null) return 'locked';
    if (rank < highestUnlockedRank) return 'completed';
    if (rank === highestUnlockedRank) return 'current';
    return 'locked';
  }

  async getMap(userId: string): Promise<LearningMap> {
    const [progress, levels] = await Promise.all([
      this.repository.getOrInitProgress(userId),
      this.repository.listRankedLevels(userId),
    ]);
    const highestUnlockedRank = progress?.highestUnlockedLevelId
      ? (levels.find((level) => level.id === progress.highestUnlockedLevelId)?.rank ?? null)
      : null;

    const worldsById = new Map<string, LearningMap['worlds'][number]>();
    for (const level of levels) {
      let world = worldsById.get(level.worldId);
      if (!world) {
        world = {
          description: level.worldDescription,
          id: level.worldId,
          levels: [],
          position: level.worldPosition,
          title: level.worldTitle,
        };
        worldsById.set(level.worldId, world);
      }
      world.levels.push({
        completedStageCount: level.completedStageCount,
        id: level.id,
        isCapstone: level.isCapstone,
        position: level.position,
        stageCount: level.stageCount,
        status: this.levelStatus(level.rank, highestUnlockedRank),
        title: level.title,
      });
    }

    return {
      worlds: [...worldsById.values()].sort((a, b) => a.position - b.position),
    };
  }

  async getLevel(userId: string, levelId: string): Promise<LearningLevelDetail> {
    const [progress, levels, rank] = await Promise.all([
      this.repository.getOrInitProgress(userId),
      this.repository.listRankedLevels(userId),
      this.repository.getLevelRank(levelId),
    ]);
    const level = levels.find((entry) => entry.id === levelId);
    if (!level || rank === null) throw new NotFoundException('Nível não encontrado.');

    const highestUnlockedRank = progress?.highestUnlockedLevelId
      ? (levels.find((entry) => entry.id === progress.highestUnlockedLevelId)?.rank ?? null)
      : null;
    const status = this.levelStatus(rank, highestUnlockedRank);

    const stageRows = await this.repository.getStagesForLevel(levelId, userId);
    let firstIncompleteFound = false;
    const stages = stageRows.map((stage) => {
      let stageStatus: LearningStageStatus;
      if (status === 'completed') stageStatus = 'completed';
      else if (status === 'locked') stageStatus = 'locked';
      else if (stage.completedAt) stageStatus = 'completed';
      else if (!firstIncompleteFound) {
        stageStatus = 'available';
        firstIncompleteFound = true;
      } else stageStatus = 'locked';
      return { id: stage.id, position: stage.position, status: stageStatus, type: stage.type };
    });

    return {
      completedStageCount: level.completedStageCount,
      id: level.id,
      isCapstone: level.isCapstone,
      position: level.position,
      stageCount: level.stageCount,
      stages,
      status,
      title: level.title,
      worldId: level.worldId,
    };
  }

  async getProgress(userId: string): Promise<LearningProgress> {
    const progress = await this.repository.getOrInitProgress(userId);
    return {
      currentLevelId: progress?.currentLevelId ?? null,
      currentWorldId: progress?.currentWorldId ?? null,
      highestUnlockedLevelId: progress?.highestUnlockedLevelId ?? null,
      streakDays: progress?.streakDays ?? 0,
      xp: progress?.xp ?? 0,
    };
  }

  private async assertStageReachable(userId: string, levelId: string, stageId: string) {
    const level = await this.getLevel(userId, levelId);
    const stage = level.stages.find((entry) => entry.id === stageId);
    if (!stage) throw new NotFoundException('Etapa não encontrada.');
    if (stage.status === 'locked') {
      throw new BadRequestException(
        'Esta etapa ainda está bloqueada — conclua as anteriores primeiro.',
      );
    }
    return stage;
  }

  /** Resolves (and, for 'review' stages, persists) which exercise backs this attempt. */
  private async resolveExerciseId(
    userId: string,
    stageId: string,
    context: {
      allowedThemes: string[] | null;
      exerciseId: string | null;
      levelDifficultyMax: number;
      levelDifficultyMin: number;
      type: string;
    },
    completion: { resolvedExerciseId: string | null },
  ): Promise<string> {
    if (context.type === 'lesson') {
      throw new BadRequestException('Etapas de aula ainda não são suportadas nesta versão.');
    }
    if (context.type !== 'review') {
      if (!context.exerciseId) throw new NotFoundException('Etapa sem exercício associado.');
      return context.exerciseId;
    }
    if (completion.resolvedExerciseId) return completion.resolvedExerciseId;

    const skill = await this.repository.pickWeakestSkill(userId, context.allowedThemes);
    const exerciseId = await this.repository.pickReviewExercise(
      userId,
      skill,
      context.levelDifficultyMin,
      context.levelDifficultyMax,
    );
    if (!exerciseId)
      throw new NotFoundException('Nenhum exercício de revisão disponível para este nível.');
    await this.repository.setResolvedExercise(userId, stageId, exerciseId);
    return exerciseId;
  }

  /** Ensures a real (1-item) training session backs this exercise, so the client can reuse evaluate-line(). */
  private async resolveTrainingSession(
    userId: string,
    stageId: string,
    exerciseId: string,
    completion: { trainingSessionId: string | null },
  ): Promise<string> {
    if (completion.trainingSessionId) return completion.trainingSessionId;
    const sessionId = await this.exercises.createSingleItemSession(userId, exerciseId);
    await this.repository.setTrainingSession(userId, stageId, sessionId);
    return sessionId;
  }

  async startStage(userId: string, stageId: string): Promise<StartLearningStageResult> {
    const context = await this.repository.getStageContext(stageId);
    if (!context) throw new NotFoundException('Etapa não encontrada.');
    await this.assertStageReachable(userId, context.levelId, stageId);

    const completion = await this.repository.getOrStartCompletion(userId, stageId);
    const exerciseId = await this.resolveExerciseId(userId, stageId, context, completion);
    const trainingSessionId = await this.resolveTrainingSession(
      userId,
      stageId,
      exerciseId,
      completion,
    );
    return { exerciseId, levelId: context.levelId, stageId, trainingSessionId, type: context.type };
  }

  async completeStage(userId: string, stageId: string): Promise<CompleteLearningStageResult> {
    const context = await this.repository.getStageContext(stageId);
    if (!context) throw new NotFoundException('Etapa não encontrada.');
    await this.assertStageReachable(userId, context.levelId, stageId);

    const completion = await this.repository.getOrStartCompletion(userId, stageId);
    if (completion.status === 'completed') {
      const [levelCompleted, worldCompleted, progress] = await Promise.all([
        this.repository.isLevelFullyCompleted(userId, context.levelId),
        this.repository.isCapstoneLevel(context.levelId),
        this.repository.getOrInitProgress(userId),
      ]);
      return {
        correctFirstTry: completion.attempts <= 1,
        hintsUsed: completion.hintsUsed,
        levelCompleted,
        newBadges: [],
        stageId,
        status: 'completed',
        streakDays: progress?.streakDays ?? 0,
        worldCompleted: levelCompleted && worldCompleted,
        xpAwarded: 0,
      };
    }

    const exerciseId = await this.resolveExerciseId(userId, stageId, context, completion);
    const { failures, successes } = await this.repository.countAttemptsSince(
      userId,
      exerciseId,
      completion.startedAt,
    );
    if (successes === 0) {
      throw new BadRequestException(
        'Ainda não resolvido — jogue o exercício corretamente antes de concluir a etapa.',
      );
    }

    const correctFirstTry = failures === 0;
    await this.repository.markStageCompleted(userId, stageId, { correctFirstTry, hintsUsed: 0 });

    const tags = await this.repository.getExerciseTags(exerciseId);
    await this.repository.upsertSkillMastery(userId, tags, successes, failures);

    const levelCompleted = await this.repository.isLevelFullyCompleted(userId, context.levelId);
    let worldCompleted = false;
    if (levelCompleted) {
      const isCapstone = await this.repository.isCapstoneLevel(context.levelId);
      await this.repository.advanceProgressPastLevel(userId, context.levelId);
      worldCompleted = isCapstone;
    }

    // Gamificação (FASE 15 do spec): escopo modesto, atrelado a marcos reais
    // já computados acima — nunca inventa progresso paralelo. XP: base fixa
    // + bônus por acertar de primeira, nunca reconcedido (só nesta ramificação
    // de "primeira conclusão da etapa", não no early-return acima).
    const xpAwarded = 10 + (correctFirstTry ? 5 : 0);
    await this.repository.addXp(userId, xpAwarded);
    const streakDays = await this.repository.bumpStreak(userId);

    const newBadges: Omit<LearningBadge, 'earnedAt'>[] = [];
    const totalCompleted = await this.repository.countCompletedStages(userId);
    if (totalCompleted === 1) {
      const label = 'Primeiros passos';
      if (await this.repository.awardBadge(userId, 'first_stage', label)) {
        newBadges.push({ badgeKey: 'first_stage', label });
      }
    }
    if (levelCompleted && (await this.repository.isLevelPerfectFirstTry(userId, context.levelId))) {
      const label = 'Nível perfeito';
      if (await this.repository.awardBadge(userId, 'perfect_level', label)) {
        newBadges.push({ badgeKey: 'perfect_level', label });
      }
    }
    if (worldCompleted) {
      const worldTitle = await this.repository.getWorldTitle(context.worldId);
      const badgeKey = `world_completed:${context.worldId}`;
      const label = `Mundo concluído: ${worldTitle ?? '?'}`;
      if (await this.repository.awardBadge(userId, badgeKey, label)) {
        newBadges.push({ badgeKey, label });
      }
    }
    if (streakDays >= 7) {
      const label = 'Sequência de 7 dias';
      if (await this.repository.awardBadge(userId, 'streak_7', label)) {
        newBadges.push({ badgeKey: 'streak_7', label });
      }
    }

    return {
      correctFirstTry,
      hintsUsed: 0,
      levelCompleted,
      newBadges,
      stageId,
      status: 'completed',
      streakDays,
      worldCompleted,
      xpAwarded,
    };
  }

  async listBadges(userId: string): Promise<LearningBadge[]> {
    return this.repository.listBadges(userId);
  }
}
