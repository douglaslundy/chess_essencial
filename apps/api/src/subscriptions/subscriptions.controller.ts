import { Body, Controller, Get, NotFoundException, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { parseInput } from '../common/http/parse-input.js';
import { UsersRepository } from '../users/users.repository.js';
import { SubscriptionsService } from './subscriptions.service.js';

const createCheckoutInputSchema = z.object({ planId: z.string().uuid() });

@UseGuards(AccessTokenGuard)
@Controller()
export class SubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly users: UsersRepository,
  ) {}

  @Get('subscription-plans')
  listActivePlans() {
    return this.subscriptions.listActivePlans().then((items) => ({ items }));
  }

  @Get('me/subscription')
  getMySubscription(@Req() request: AuthenticatedRequest) {
    return this.subscriptions.getMySubscription(request.auth.userId);
  }

  @Post('me/subscription/checkout')
  async createCheckout(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseInput(createCheckoutInputSchema, body);
    const user = await this.users.findById(request.auth.userId);
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return this.subscriptions.createCheckout(request.auth.userId, input.planId, user.email);
  }
}
