import { moderateReportInputSchema, moderationQueueQuerySchema } from '@xadrez/contracts';
import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { AdminGuard } from '../admin/admin.guard.js';
import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { parseInput } from '../common/http/parse-input.js';
import { ModerationAdminService } from './moderation-admin.service.js';

const reportIdSchema = z.string().uuid();

@Controller('admin/reports')
@UseGuards(AccessTokenGuard, AdminGuard)
export class ModerationAdminController {
  constructor(private readonly moderation: ModerationAdminService) {}

  @Get()
  list(@Query() query: unknown) {
    return this.moderation.list(parseInput(moderationQueueQuerySchema, query));
  }

  @Get(':reportId')
  detail(@Param('reportId') reportId: string) {
    return this.moderation.detail(parseInput(reportIdSchema, reportId));
  }

  @Patch(':reportId')
  moderate(
    @Req() request: AuthenticatedRequest,
    @Param('reportId') reportId: string,
    @Body() body: unknown,
  ) {
    return this.moderation.moderate(
      request.auth.userId,
      parseInput(reportIdSchema, reportId),
      parseInput(moderateReportInputSchema, body),
    );
  }
}
