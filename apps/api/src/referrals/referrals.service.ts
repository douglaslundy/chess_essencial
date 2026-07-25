import type { UpdateReferralSettingsInput } from '@xadrez/contracts';
import { Injectable } from '@nestjs/common';

import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { ReferralsRepository } from './referrals.repository.js';

@Injectable()
export class ReferralsService {
  constructor(
    private readonly repository: ReferralsRepository,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  myStats(userId: string) {
    return this.repository.myStats(userId);
  }

  attribute(referralCode: string, referredUserId: string) {
    return this.repository.attribute(referralCode, referredUserId);
  }

  getSettings() {
    return this.repository.getSettings();
  }

  updateSettings(input: UpdateReferralSettingsInput, userId: string) {
    return this.repository.updateSettings(input, userId);
  }

  /**
   * Called when a referred user verifies their email. Rewards the referrer
   * only if an admin has configured a reward plan/duration — otherwise the
   * referral is still marked resolved, just with no payout.
   */
  async rewardReferrerIfPending(referredUserId: string): Promise<void> {
    const referrerUserId = await this.repository.resolvePendingReferrer(referredUserId);
    if (!referrerUserId) return;
    const settings = await this.repository.getSettings();
    if (!settings.rewardPlanId || settings.rewardDays <= 0) return;
    await this.subscriptions.grantTemporaryPlanIfNone(
      referrerUserId,
      settings.rewardPlanId,
      settings.rewardDays,
    );
  }
}
