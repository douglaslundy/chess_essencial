import { saveLessonInputSchema } from '@xadrez/contracts';
import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { parseInput } from '../common/http/parse-input.js';
import { CoursesService } from './courses.service.js';

const idSchema = z.string().uuid();
const slugSchema = z.string().regex(/^[a-z0-9-]+$/);

@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  listPublished() {
    return this.courses.listPublished();
  }

  @Get(':slug')
  getPublished(@Param('slug') slug: string) {
    return this.courses.getPublished(parseInput(slugSchema, slug));
  }

  @UseGuards(AccessTokenGuard)
  @Get(':courseId/editor')
  getEditor(@Req() request: AuthenticatedRequest, @Param('courseId') courseId: string) {
    return this.courses.getEditor(parseInput(idSchema, courseId), request.auth.userId);
  }

  @UseGuards(AccessTokenGuard)
  @Put(':courseId/lessons/:slug')
  saveLesson(
    @Req() request: AuthenticatedRequest,
    @Param('courseId') courseId: string,
    @Param('slug') slug: string,
    @Body() body: unknown,
  ) {
    return this.courses.saveLesson(
      parseInput(idSchema, courseId),
      parseInput(slugSchema, slug),
      request.auth.userId,
      parseInput(saveLessonInputSchema, body),
    );
  }

  @UseGuards(AccessTokenGuard)
  @Post(':courseId/publish')
  publish(@Req() request: AuthenticatedRequest, @Param('courseId') courseId: string) {
    return this.courses.publish(parseInput(idSchema, courseId), request.auth.userId);
  }
}
