import { sendMessageInputSchema } from '@xadrez/contracts';
import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';

import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { parseInput } from '../common/http/parse-input.js';
import { MessagesService } from './messages.service.js';

@UseGuards(AccessTokenGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get('conversations')
  listConversations(@Req() request: AuthenticatedRequest) {
    return this.messages.listConversations(request.auth.userId);
  }

  @Get(':friendUserId')
  listMessages(
    @Req() request: AuthenticatedRequest,
    @Param('friendUserId') friendUserId: string,
    @Query('before') before?: string,
  ) {
    return this.messages.listMessages(request.auth.userId, friendUserId, before);
  }

  @Post(':friendUserId')
  sendMessage(
    @Req() request: AuthenticatedRequest,
    @Param('friendUserId') friendUserId: string,
    @Body() body: unknown,
  ) {
    const input = parseInput(sendMessageInputSchema, body);
    return this.messages.sendMessage(request.auth.userId, friendUserId, input.body);
  }
}
