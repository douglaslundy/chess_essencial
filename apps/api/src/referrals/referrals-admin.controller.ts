import { updateReferralSettingsInputSchema } from '@xadrez/contracts';
import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';

import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { AdminGuard } from '../admin/admin.guard.js';
import { parseInput } from '../common/http/parse-input.js';
import { ReferralsService } from './referrals.service.js';

@UseGuards(AccessTokenGuard, AdminGuard)
@Controller('admin/referral-settings')
export class ReferralsAdminController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get()
  getSettings() {
    return this.referrals.getSettings();
  }

  @Put()
  updateSettings(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseInput(updateReferralSettingsInputSchema, body);
    return this.referrals.updateSettings(input, request.auth.userId);
  }
}
