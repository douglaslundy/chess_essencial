import {
  createBotGameInputSchema,
  createChallengeInputSchema,
  joinQueueInputSchema,
  respondChallengeInputSchema,
} from '@xadrez/contracts';
import { Body, Controller, Delete, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { AccessTokenGuard, type AuthenticatedRequest } from '../../auth/access-token.guard.js';
import { parseInput } from '../../common/http/parse-input.js';
import { MatchmakingService } from '../application/matchmaking.service.js';

@Controller('matchmaking')
@UseGuards(AccessTokenGuard)
export class MatchmakingController {
  constructor(private readonly matchmaking: MatchmakingService) {}

  @Post('queues')
  join(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.matchmaking.join(request.auth.userId, parseInput(joinQueueInputSchema, body));
  }

  @Post('bot-games')
  createBotGame(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.matchmaking.createBotGame(
      request.auth.userId,
      parseInput(createBotGameInputSchema, body),
    );
  }

  @Delete('queues')
  @HttpCode(204)
  async leave(@Req() request: AuthenticatedRequest) {
    await this.matchmaking.leave(request.auth.userId);
  }

  @Post('challenges')
  createChallenge(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.matchmaking.createChallenge(
      request.auth.userId,
      parseInput(createChallengeInputSchema, body),
    );
  }

  @Post('challenges/:challengeId/respond')
  respondChallenge(
    @Req() request: AuthenticatedRequest,
    @Param('challengeId') challengeId: string,
    @Body() body: unknown,
  ) {
    return this.matchmaking.respondChallenge(
      request.auth.userId,
      parseInput(z.string().uuid(), challengeId),
      parseInput(respondChallengeInputSchema, body),
    );
  }
}
