import { adminUserSearchQuerySchema, updateAdminUserStatusInputSchema } from '@xadrez/contracts';
import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { parseInput } from '../common/http/parse-input.js';
import { AdminGuard } from './admin.guard.js';
import { AdminService } from './admin.service.js';

const idSchema = z.string().uuid();

@UseGuards(AccessTokenGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  listUsers(@Query() query: unknown) {
    return this.admin.listUsers(parseInput(adminUserSearchQuerySchema, query));
  }

  @Get('bots/stats')
  getBotStats() {
    return this.admin.getBotStats();
  }

  @Get('bots/online')
  listOnlineBots() {
    return this.admin.listOnlineBots();
  }

  @Get('metrics')
  getMetrics() {
    return this.admin.getMetrics();
  }

  @Patch('users/:userId/status')
  updateUserStatus(
    @Req() request: AuthenticatedRequest,
    @Param('userId') userId: string,
    @Body() body: unknown,
  ) {
    return this.admin.updateUserStatus(
      request.auth.userId,
      parseInput(idSchema, userId),
      parseInput(updateAdminUserStatusInputSchema, body),
    );
  }
}
