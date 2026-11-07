import type { PlayerMetrics } from '@xadrez/contracts';
import { Controller, Get, Req, UseGuards } from '@nestjs/common';

import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { PlayerMetricsRepository } from './player-metrics.repository.js';

@UseGuards(AccessTokenGuard)
@Controller('me')
export class PlayerMetricsController {
  constructor(private readonly metrics: PlayerMetricsRepository) {}

  /** Games, time played, move quality, strong and weak points of the signed-in player. */
  @Get('metrics')
  forMe(@Req() request: AuthenticatedRequest): Promise<PlayerMetrics> {
    return this.metrics.forUser(request.auth.userId);
  }
}
