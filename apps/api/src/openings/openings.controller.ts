import {
  openingPracticeInputSchema,
  openingSideSchema,
  type OpeningDetail,
  type OpeningFamily,
  type OpeningLine,
} from '@xadrez/contracts';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { parseInput } from '../common/http/parse-input.js';
import { OpeningsService } from './openings.service.js';

const idSchema = z.string().uuid();
const searchSchema = z.object({
  family: z.string().trim().min(1).max(120).optional(),
  q: z.string().trim().min(1).max(80).optional(),
});

@UseGuards(AccessTokenGuard)
@Controller('openings')
export class OpeningsController {
  constructor(private readonly openings: OpeningsService) {}

  @Get('families')
  families(@Query('side') side?: string): Promise<OpeningFamily[]> {
    return this.openings.families(side ? parseInput(openingSideSchema, side) : undefined);
  }

  @Get('due')
  due(@Req() request: AuthenticatedRequest): Promise<OpeningLine[]> {
    return this.openings.due(request.auth.userId);
  }

  @Get()
  search(@Query() query: unknown): Promise<OpeningLine[]> {
    return this.openings.search(parseInput(searchSchema, query));
  }

  @Get(':openingId')
  detail(
    @Req() request: AuthenticatedRequest,
    @Param('openingId') openingId: string,
  ): Promise<OpeningDetail> {
    return this.openings.detail(parseInput(idSchema, openingId), request.auth.userId);
  }

  /** Starts the lesson (once per line, then stored) and returns its current state. */
  @Post(':openingId/lesson')
  lesson(
    @Req() request: AuthenticatedRequest,
    @Param('openingId') openingId: string,
  ): Promise<OpeningDetail> {
    return this.openings.requestLesson(parseInput(idSchema, openingId), request.auth.userId);
  }

  @Post(':openingId/practice')
  @HttpCode(200)
  practice(
    @Req() request: AuthenticatedRequest,
    @Param('openingId') openingId: string,
    @Body() body: unknown,
  ): Promise<{ dueAt: string }> {
    return this.openings.practice(
      parseInput(idSchema, openingId),
      request.auth.userId,
      parseInput(openingPracticeInputSchema, body).correct,
    );
  }
}
