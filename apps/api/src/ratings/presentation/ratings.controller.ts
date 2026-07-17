import { ratingPoolSchema } from '@xadrez/contracts';
import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { AccessTokenGuard, type AuthenticatedRequest } from '../../auth/access-token.guard.js';
import { parseInput } from '../../common/http/parse-input.js';
import { RatingsService } from '../application/ratings.service.js';

@Controller('ratings')
@UseGuards(AccessTokenGuard)
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @Get('me')
  profiles(@Req() request: AuthenticatedRequest) {
    return this.ratings.profiles(request.auth.userId);
  }

  @Get('me/history')
  history(@Req() request: AuthenticatedRequest, @Query('pool') pool?: string) {
    return this.ratings.history(
      request.auth.userId,
      pool === undefined ? undefined : parseInput(ratingPoolSchema, pool),
    );
  }

  @Get(':pool/leaderboard')
  leaderboard(@Param('pool') pool: string, @Query('limit') limit?: string) {
    return this.ratings.leaderboard(
      parseInput(ratingPoolSchema, pool),
      parseInput(z.coerce.number().int().min(1).max(100).default(50), limit),
    );
  }
}
