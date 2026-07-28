import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { parseInput } from '../common/http/parse-input.js';
import { LearningPathService } from './learning-path.service.js';

const levelIdSchema = z.string().uuid();

@UseGuards(AccessTokenGuard)
@Controller('learning-path')
export class LearningPathController {
  constructor(private readonly learningPath: LearningPathService) {}

  @Get('map')
  map(@Req() request: AuthenticatedRequest) {
    return this.learningPath.getMap(request.auth.userId);
  }

  @Get('levels/:levelId')
  level(@Req() request: AuthenticatedRequest, @Param('levelId') levelId: string) {
    return this.learningPath.getLevel(request.auth.userId, parseInput(levelIdSchema, levelId));
  }

  @Get('progress')
  progress(@Req() request: AuthenticatedRequest) {
    return this.learningPath.getProgress(request.auth.userId);
  }
}
