import {
  exerciseSearchQuerySchema,
  startExerciseTrainingInputSchema,
  submitExerciseAttemptInputSchema,
} from '@xadrez/contracts';
import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { parseInput } from '../common/http/parse-input.js';
import { ExercisesService } from './exercises.service.js';

const idSchema = z.string().uuid();

@UseGuards(AccessTokenGuard)
@Controller()
export class ExercisesController {
  constructor(private readonly exercises: ExercisesService) {}

  @Get('exercises')
  search(@Query() query: unknown) {
    return this.exercises.search(parseInput(exerciseSearchQuerySchema, query));
  }

  @Post('exercise-training-sessions')
  startTraining(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.exercises.startTraining(
      request.auth.userId,
      parseInput(startExerciseTrainingInputSchema, body),
    );
  }

  @Get('exercise-training-sessions/:sessionId')
  training(@Req() request: AuthenticatedRequest, @Param('sessionId') sessionId: string) {
    return this.exercises.training(request.auth.userId, parseInput(idSchema, sessionId));
  }

  @Post('exercise-training-sessions/:sessionId/hints')
  hint(@Req() request: AuthenticatedRequest, @Param('sessionId') sessionId: string) {
    return this.exercises.hint(request.auth.userId, parseInput(idSchema, sessionId));
  }

  @Post('exercise-training-sessions/:sessionId/solution')
  solution(@Req() request: AuthenticatedRequest, @Param('sessionId') sessionId: string) {
    return this.exercises.solution(request.auth.userId, parseInput(idSchema, sessionId));
  }

  @Post('exercises/:exerciseId/attempts')
  attempt(
    @Req() request: AuthenticatedRequest,
    @Param('exerciseId') exerciseId: string,
    @Body() body: unknown,
  ) {
    return this.exercises.attempt(
      request.auth.userId,
      parseInput(idSchema, exerciseId),
      parseInput(submitExerciseAttemptInputSchema, body),
    );
  }

  @Get('exercise-metrics')
  metrics(@Req() request: AuthenticatedRequest) {
    return this.exercises.metrics(request.auth.userId);
  }
}
