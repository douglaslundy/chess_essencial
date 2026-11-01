import { courseTrailActivityIdSchema, type CourseTrailProgress } from '@xadrez/contracts';
import { Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';

import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { parseInput } from '../common/http/parse-input.js';
import { CourseRepository } from './course.repository.js';

@UseGuards(AccessTokenGuard)
@Controller('course-trail')
export class CourseController {
  constructor(private readonly course: CourseRepository) {}

  @Get('progress')
  async progress(@Req() request: AuthenticatedRequest): Promise<CourseTrailProgress> {
    return { completedActivityIds: await this.course.completedActivityIds(request.auth.userId) };
  }

  /** Idempotent: marks one activity as finished and returns the whole progress. */
  @Put('progress/:activityId')
  async complete(
    @Req() request: AuthenticatedRequest,
    @Param('activityId') activityId: string,
  ): Promise<CourseTrailProgress> {
    await this.course.markCompleted(
      request.auth.userId,
      parseInput(courseTrailActivityIdSchema, activityId),
    );
    return this.progress(request);
  }
}
