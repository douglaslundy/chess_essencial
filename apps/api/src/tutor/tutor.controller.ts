import {
  requestTutorLessonInputSchema,
  tutorContentIdSchema,
  tutorKindSchema,
  type TutorLesson,
} from '@xadrez/contracts';
import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';

import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { parseInput } from '../common/http/parse-input.js';
import { TutorService } from './tutor.service.js';

@UseGuards(AccessTokenGuard)
@Controller('tutor')
export class TutorController {
  constructor(private readonly tutor: TutorService) {}

  /** Whether the caller has the teacher profile (admins have every profile). */
  @Get('access')
  async access(@Req() request: AuthenticatedRequest): Promise<{ allowed: boolean }> {
    return { allowed: await this.tutor.isTeacher(request.auth.userId) };
  }

  @Get('lessons/:kind/:contentId')
  async lesson(
    @Req() request: AuthenticatedRequest,
    @Param('kind') kind: string,
    @Param('contentId') contentId: string,
  ): Promise<TutorLesson> {
    await this.tutor.requireTeacher(request.auth.userId);
    return this.tutor.get(
      parseInput(tutorKindSchema, kind),
      parseInput(tutorContentIdSchema, contentId),
    );
  }

  /** Starts the generation (once per content) and returns the current state. */
  @Post('lessons')
  async request(@Req() request: AuthenticatedRequest, @Body() body: unknown): Promise<TutorLesson> {
    await this.tutor.requireTeacher(request.auth.userId);
    const input = parseInput(requestTutorLessonInputSchema, body);
    return this.tutor.request(request.auth.userId, input.kind, input.contentId, input.steps);
  }
}
