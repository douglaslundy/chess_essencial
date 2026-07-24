import type {
  PlanFeatureKey,
  PlanFeatureUsage,
  SaveSubscriptionPlanInput,
  UpdateSubscriptionPlanStatusInput,
  UserSubscription,
} from '@xadrez/contracts';
import { Injectable } from '@nestjs/common';

import { SubscriptionsRepository } from './subscriptions.repository.js';

@Injectable()
export class SubscriptionsService {
  constructor(private readonly repository: SubscriptionsRepository) {}

  listPlans() {
    return this.repository.listPlans();
  }

  createPlan(input: SaveSubscriptionPlanInput) {
    return this.repository.createPlan(input);
  }

  updatePlan(planId: string, input: SaveSubscriptionPlanInput) {
    return this.repository.updatePlan(planId, input);
  }

  updatePlanStatus(planId: string, input: UpdateSubscriptionPlanStatusInput) {
    return this.repository.updatePlanStatus(planId, input.status);
  }

  async getMySubscription(userId: string): Promise<UserSubscription> {
    const active = await this.repository.getActiveSubscriptionForUser(userId);
    if (!active) return { currentPeriodEnd: null, plan: null, status: null };
    return {
      currentPeriodEnd: active.currentPeriodEnd?.toISOString() ?? null,
      plan: active.plan,
      status: active.status as 'active' | 'canceled' | 'expired',
    };
  }

  /**
   * Users with no active subscription are unrestricted — quotas only apply
   * once a paid plan is actually assigned (see SP-I). This keeps every
   * existing user's experience unchanged until they actually subscribe.
   */
  async checkEntitlement(userId: string, featureKey: PlanFeatureKey): Promise<PlanFeatureUsage> {
    const active = await this.repository.getActiveSubscriptionForUser(userId);
    if (!active) return { allowed: true, featureKey, limit: null, used: 0 };
    const limit = active.plan.limits.find((entry) => entry.featureKey === featureKey);
    if (!limit) return { allowed: false, featureKey, limit: 0, used: 0 };
    if (limit.dailyLimit === 0) return { allowed: true, featureKey, limit: null, used: 0 };
    const used = await this.repository.usageToday(userId, featureKey);
    return { allowed: used < limit.dailyLimit, featureKey, limit: limit.dailyLimit, used };
  }
}
