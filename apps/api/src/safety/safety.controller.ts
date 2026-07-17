import { createReportInputSchema, updatePrivacyInputSchema } from '@xadrez/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { parseInput } from '../common/http/parse-input.js';
import { SafetyService } from './safety.service.js';

const userIdSchema = z.string().uuid();

@Controller()
@UseGuards(AccessTokenGuard)
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  @Get('me/privacy')
  privacy(@Req() request: AuthenticatedRequest) {
    return this.safety.privacy(request.auth.userId);
  }

  @Patch('me/privacy')
  updatePrivacy(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.safety.updatePrivacy(
      request.auth.userId,
      parseInput(updatePrivacyInputSchema, body),
    );
  }

  @Get('me/blocks')
  listBlocks(@Req() request: AuthenticatedRequest) {
    return this.safety.listBlocks(request.auth.userId);
  }

  @Put('me/blocks/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  block(@Req() request: AuthenticatedRequest, @Param('userId') userId: string) {
    return this.safety.block(request.auth.userId, parseInput(userIdSchema, userId));
  }

  @Delete('me/blocks/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  unblock(@Req() request: AuthenticatedRequest, @Param('userId') userId: string) {
    return this.safety.unblock(request.auth.userId, parseInput(userIdSchema, userId));
  }

  @Post('reports')
  createReport(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.safety.createReport(request.auth.userId, parseInput(createReportInputSchema, body));
  }
}
