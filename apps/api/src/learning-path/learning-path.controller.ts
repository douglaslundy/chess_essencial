import { Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { parseInput } from '../common/http/parse-input.js';
import { LearningPathService } from './learning-path.service.js';

const idSchema = z.string().uuid();

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
    return this.learningPath.getLevel(request.auth.userId, parseInput(idSchema, levelId));
  }

  @Get('progress')
  progress(@Req() request: AuthenticatedRequest) {
    return this.learningPath.getProgress(request.auth.userId);
  }

  @Get('badges')
  badges(@Req() request: AuthenticatedRequest) {
    return this.learningPath.listBadges(request.auth.userId);
  }

  @Post('stages/:stageId/start')
  @HttpCode(HttpStatus.OK)
  startStage(@Req() request: AuthenticatedRequest, @Param('stageId') stageId: string) {
    return this.learningPath.startStage(request.auth.userId, parseInput(idSchema, stageId));
  }

  @Post('stages/:stageId/complete')
  @HttpCode(HttpStatus.OK)
  completeStage(@Req() request: AuthenticatedRequest, @Param('stageId') stageId: string) {
    return this.learningPath.completeStage(request.auth.userId, parseInput(idSchema, stageId));
  }
}
