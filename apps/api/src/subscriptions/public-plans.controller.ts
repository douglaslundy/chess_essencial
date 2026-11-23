import { Controller, Get } from '@nestjs/common';

import { SubscriptionsService } from './subscriptions.service.js';

/** Unauthenticated catalog for the public landing page (prices are not secret). */
@Controller('public/subscription-plans')
export class PublicPlansController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  listActivePlans() {
    return this.subscriptions.listActivePlans().then((items) => ({ items }));
  }
}
