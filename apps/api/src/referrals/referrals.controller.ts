import { Controller, Get, Req, UseGuards } from '@nestjs/common';

import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard.js';
import { ReferralsService } from './referrals.service.js';

@UseGuards(AccessTokenGuard)
@Controller('me/referral')
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get()
  myReferral(@Req() request: AuthenticatedRequest) {
    return this.referrals.myStats(request.auth.userId);
  }
}
