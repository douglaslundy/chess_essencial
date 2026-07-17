import { lessonActionInputSchema, startLessonAttemptInputSchema } from '@xadrez/contracts';
import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { parseInput } from '../common/http/parse-input.js';
import { LessonRuntimeService } from './lesson-runtime.service.js';

const idSchema = z.string().uuid();

@UseGuards(AccessTokenGuard)
@Controller()
export class LessonRuntimeController {
  constructor(private readonly runtime: LessonRuntimeService) {}

  @Get('lessons/:lessonId')
  lesson(@Req() request: AuthenticatedRequest, @Param('lessonId') lessonId: string) {
    return this.runtime.lesson(request.auth.userId, parseInput(idSchema, lessonId));
  }

  @Post('lesson-attempts')
  start(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.runtime.start(request.auth.userId, parseInput(startLessonAttemptInputSchema, body));
  }

  @Get('lesson-attempts/:attemptId')
  get(@Req() request: AuthenticatedRequest, @Param('attemptId') attemptId: string) {
    return this.runtime.get(request.auth.userId, parseInput(idSchema, attemptId));
  }

  @Post('lesson-attempts/:attemptId/actions')
  act(
    @Req() request: AuthenticatedRequest,
    @Param('attemptId') attemptId: string,
    @Body() body: unknown,
  ) {
    return this.runtime.act(
      request.auth.userId,
      parseInput(idSchema, attemptId),
      parseInput(lessonActionInputSchema, body),
    );
  }
}
