import { sendFriendRequestInputSchema } from '@xadrez/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { parseInput } from '../common/http/parse-input.js';
import { SocialAccessGuard } from '../subscriptions/social-access.guard.js';
import { SocialService } from './social.service.js';

@UseGuards(AccessTokenGuard)
@Controller()
export class SocialController {
  constructor(private readonly social: SocialService) {}

  // Presence and public-profile viewing stay ungated — other features (game
  // rooms, matchmaking, history) rely on them regardless of plan.
  @Post('presence/heartbeat')
  @HttpCode(204)
  async heartbeat(@Req() request: AuthenticatedRequest) {
    await this.social.heartbeat(request.auth.userId);
  }

  @Get('friends')
  @UseGuards(SocialAccessGuard)
  listFriends(@Req() request: AuthenticatedRequest) {
    return this.social.listFriends(request.auth.userId);
  }

  @Get('friends/requests')
  @UseGuards(SocialAccessGuard)
  listRequests(@Req() request: AuthenticatedRequest) {
    return this.social.listRequests(request.auth.userId);
  }

  @Post('friends/requests')
  @UseGuards(SocialAccessGuard)
  sendRequest(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseInput(sendFriendRequestInputSchema, body);
    return this.social.sendRequest(request.auth.userId, input.username);
  }

  @Post('friends/requests/:username/accept')
  @UseGuards(SocialAccessGuard)
  acceptRequest(@Req() request: AuthenticatedRequest, @Param('username') username: string) {
    return this.social.acceptRequest(request.auth.userId, username);
  }

  @Post('friends/requests/:username/decline')
  @HttpCode(204)
  @UseGuards(SocialAccessGuard)
  async declineRequest(@Req() request: AuthenticatedRequest, @Param('username') username: string) {
    await this.social.declineRequest(request.auth.userId, username);
  }

  @Delete('friends/requests/:username')
  @HttpCode(204)
  @UseGuards(SocialAccessGuard)
  async cancelRequest(@Req() request: AuthenticatedRequest, @Param('username') username: string) {
    await this.social.cancelRequest(request.auth.userId, username);
  }

  @Delete('friends/:userId')
  @HttpCode(204)
  @UseGuards(SocialAccessGuard)
  async removeFriend(@Req() request: AuthenticatedRequest, @Param('userId') userId: string) {
    await this.social.removeFriend(request.auth.userId, userId);
  }

  @Get('users/:username')
  publicProfile(@Req() request: AuthenticatedRequest, @Param('username') username: string) {
    return this.social.publicProfile(request.auth.userId, username);
  }
}
