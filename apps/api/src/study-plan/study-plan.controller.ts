import type { GameStudyPlan } from '@xadrez/contracts';
import {
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Put,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';

import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { StudyPlanRepository, type StudyKind } from './study-plan.repository.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@UseGuards(AccessTokenGuard)
@Controller()
export class StudyPlanController {
  constructor(private readonly plans: StudyPlanRepository) {}

  /** Study themes, 5 exercises and 3 library games for the player's weak points in this game. */
  @Get('games/:gameId/study-plan')
  async studyPlan(
    @Req() request: AuthenticatedRequest,
    @Param('gameId') gameId: string,
  ): Promise<GameStudyPlan> {
    const color = await this.plans.playerColor(gameId, request.auth.userId);
    if (!color) throw new NotFoundException('Partida não encontrada.');
    return this.plans.getOrCreate(gameId, request.auth.userId, color);
  }

  /** Marks an exercise as solved or a library game as watched, saved for every device. */
  @Put('me/study-progress/:kind/:itemId')
  @HttpCode(204)
  async markDone(
    @Req() request: AuthenticatedRequest,
    @Param('kind') kind: string,
    @Param('itemId') itemId: string,
  ) {
    if ((kind !== 'exercise' && kind !== 'game') || !UUID.test(itemId)) {
      throw new UnprocessableEntityException('Item de estudo inválido.');
    }
    await this.plans.markDone(request.auth.userId, kind as StudyKind, itemId);
  }
}
