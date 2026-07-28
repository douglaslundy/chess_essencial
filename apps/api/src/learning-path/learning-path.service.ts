import type {
  LearningLevelDetail,
  LearningLevelStatus,
  LearningMap,
  LearningProgress,
  LearningStageStatus,
} from '@xadrez/contracts';
import { Injectable, NotFoundException } from '@nestjs/common';

import { LearningPathRepository } from './learning-path.repository.js';

@Injectable()
export class LearningPathService {
  constructor(private readonly repository: LearningPathRepository) {}

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
}
