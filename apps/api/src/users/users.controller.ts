import { updateMeInputSchema } from '@xadrez/contracts';
import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';

import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { parseInput } from '../common/http/parse-input.js';
import { UsersService } from './users.service.js';

@Controller('me')
@UseGuards(AccessTokenGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getMe(@Req() request: AuthenticatedRequest) {
    return this.usersService.getMe(request.auth.userId);
  }

  @Patch()
  updateMe(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.usersService.updateMe(request.auth.userId, parseInput(updateMeInputSchema, body));
  }
}
