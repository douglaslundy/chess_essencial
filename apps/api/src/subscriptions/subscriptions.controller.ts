import { Controller, Get, Req, UseGuards } from '@nestjs/common';

import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { SubscriptionsService } from './subscriptions.service.js';

@UseGuards(AccessTokenGuard)
@Controller('me/subscription')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  getMySubscription(@Req() request: AuthenticatedRequest) {
    return this.subscriptions.getMySubscription(request.auth.userId);
  }
}
