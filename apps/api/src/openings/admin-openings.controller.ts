import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { adminOpeningLessonInputSchema, type AdminOpeningLesson } from '@xadrez/contracts';
import { z } from 'zod';

import { AdminGuard } from '../admin/admin.guard.js';
import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { parseInput } from '../common/http/parse-input.js';
import { OpeningsService } from './openings.service.js';

const idSchema = z.string().uuid();
const listSchema = z.object({ reviewed: z.enum(['true', 'false']).optional() });
const pregenerateSchema = z.object({ family: z.string().trim().min(1).max(120) });

/** Curation of the AI-written opening lessons: list, correct, mark as reviewed, pre-generate. */
@UseGuards(AccessTokenGuard, AdminGuard)
@Controller('admin/openings')
export class AdminOpeningsController {
  constructor(private readonly openings: OpeningsService) {}

  @Get('lessons')
  list(@Query() query: unknown): Promise<AdminOpeningLesson[]> {
    const { reviewed } = parseInput(listSchema, query);
    return this.openings.adminLessons(reviewed === undefined ? undefined : reviewed === 'true');
  }

  @Put(':openingId/lesson')
  @HttpCode(204)
  async save(
    @Req() request: AuthenticatedRequest,
    @Param('openingId') openingId: string,
    @Body() body: unknown,
  ): Promise<void> {
    await this.openings.adminSaveLesson(
      parseInput(idSchema, openingId),
      request.auth.userId,
      parseInput(adminOpeningLessonInputSchema, body),
    );
  }

  /** Starts writing the missing lessons of a family (at most 40 lines per call). */
  @Post('pregenerate')
  @HttpCode(202)
  pregenerate(@Body() body: unknown): Promise<{ started: number }> {
    return this.openings.adminPregenerate(parseInput(pregenerateSchema, body).family);
  }
}
