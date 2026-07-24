import { describe, expect, it } from 'vitest';

import type { PlanWithLimits } from './subscriptions.repository.js';
import { SubscriptionsService } from './subscriptions.service.js';

class FakeSubscriptionsRepository {
  active: { currentPeriodEnd: Date | null; plan: PlanWithLimits; status: string } | null = null;
  usage = 0;

  async getActiveSubscriptionForUser() {
    return this.active;
  }

  async usageToday() {
    return this.usage;
  }
}

function plan(limits: PlanWithLimits['limits']): PlanWithLimits {
  return { id: 'plan-1', limits, name: 'Plano', priceCents: 0, slug: 'plano', status: 'active' };
}

describe('SubscriptionsService.checkEntitlement', () => {
  it('allows everything when the user has no active subscription', async () => {
    const repository = new FakeSubscriptionsRepository();
    const service = new SubscriptionsService(repository as never);

    const result = await service.checkEntitlement('user-1', 'exercises_per_day');

    expect(result).toEqual({
      allowed: true,
      featureKey: 'exercises_per_day',
      limit: null,
      used: 0,
    });
  });

  it('blocks a feature the active plan does not include', async () => {
    const repository = new FakeSubscriptionsRepository();
    repository.active = { currentPeriodEnd: null, plan: plan([]), status: 'active' };
    const service = new SubscriptionsService(repository as never);

    const result = await service.checkEntitlement('user-1', 'games_per_day');

    expect(result).toEqual({ allowed: false, featureKey: 'games_per_day', limit: 0, used: 0 });
  });

  it('treats a daily limit of 0 as unlimited', async () => {
    const repository = new FakeSubscriptionsRepository();
    repository.active = {
      currentPeriodEnd: null,
      plan: plan([{ dailyLimit: 0, featureKey: 'exercises_per_day' }]),
      status: 'active',
    };
    const service = new SubscriptionsService(repository as never);

    const result = await service.checkEntitlement('user-1', 'exercises_per_day');

    expect(result).toEqual({
      allowed: true,
      featureKey: 'exercises_per_day',
      limit: null,
      used: 0,
    });
  });

  it('allows usage under the limit and blocks at the limit', async () => {
    const repository = new FakeSubscriptionsRepository();
    repository.active = {
      currentPeriodEnd: null,
      plan: plan([{ dailyLimit: 3, featureKey: 'lessons_per_day' }]),
      status: 'active',
    };
    const service = new SubscriptionsService(repository as never);

    repository.usage = 2;
    expect(await service.checkEntitlement('user-1', 'lessons_per_day')).toMatchObject({
      allowed: true,
      limit: 3,
      used: 2,
    });

    repository.usage = 3;
    expect(await service.checkEntitlement('user-1', 'lessons_per_day')).toMatchObject({
      allowed: false,
      limit: 3,
      used: 3,
    });
  });
});
