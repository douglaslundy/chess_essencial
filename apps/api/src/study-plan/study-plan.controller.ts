import type { GameStudyPlan } from '@xadrez/contracts';
import { Controller, Get, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';

import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { StudyPlanRepository } from './study-plan.repository.js';

@UseGuards(AccessTokenGuard)
@Controller('games')
export class StudyPlanController {
  constructor(private readonly plans: StudyPlanRepository) {}

  /** Study themes, 5 exercises and 3 library games for the player's weak points in this game. */
  @Get(':gameId/study-plan')
  async studyPlan(
    @Req() request: AuthenticatedRequest,
    @Param('gameId') gameId: string,
  ): Promise<GameStudyPlan> {
    const color = await this.plans.playerColor(gameId, request.auth.userId);
    if (!color) throw new NotFoundException('Partida não encontrada.');
    return this.plans.build(gameId, request.auth.userId, color);
  }
}
