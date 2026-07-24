import {
  saveSubscriptionPlanInputSchema,
  updateSubscriptionPlanStatusInputSchema,
} from '@xadrez/contracts';
import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';

import { AccessTokenGuard } from '../auth/access-token.guard.js';
import { AdminGuard } from '../admin/admin.guard.js';
import { parseInput } from '../common/http/parse-input.js';
import { SubscriptionsService } from './subscriptions.service.js';

@UseGuards(AccessTokenGuard, AdminGuard)
@Controller('admin/subscription-plans')
export class SubscriptionsAdminController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  listPlans() {
    return this.subscriptions.listPlans().then((items) => ({ items }));
  }

  @Post()
  createPlan(@Body() body: unknown) {
    const input = parseInput(saveSubscriptionPlanInputSchema, body);
    return this.subscriptions.createPlan(input);
  }

  @Put(':planId')
  updatePlan(@Param('planId') planId: string, @Body() body: unknown) {
    const input = parseInput(saveSubscriptionPlanInputSchema, body);
    return this.subscriptions.updatePlan(planId, input);
  }

  @Put(':planId/status')
  updatePlanStatus(@Param('planId') planId: string, @Body() body: unknown) {
    const input = parseInput(updateSubscriptionPlanStatusInputSchema, body);
    return this.subscriptions.updatePlanStatus(planId, input);
  }
}
