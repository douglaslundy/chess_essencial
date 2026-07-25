import { describe, expect, it, vi } from 'vitest';

import { ReferralsService } from './referrals.service.js';

function makeService(overrides: {
  referrerUserId?: string | null;
  rewardDays?: number;
  rewardPlanId?: string | null;
}) {
  const grantTemporaryPlanIfNone = vi.fn();
  const referrerUserId = 'referrerUserId' in overrides ? overrides.referrerUserId! : 'referrer-1';
  const rewardPlanId = 'rewardPlanId' in overrides ? overrides.rewardPlanId! : 'plan-1';
  const repository = {
    getSettings: vi.fn().mockResolvedValue({
      rewardDays: overrides.rewardDays ?? 7,
      rewardPlanId,
    }),
    resolvePendingReferrer: vi.fn().mockResolvedValue(referrerUserId),
  };
  const subscriptions = { grantTemporaryPlanIfNone };
  const service = new ReferralsService(repository as never, subscriptions as never);
  return { grantTemporaryPlanIfNone, repository, service };
}

describe('ReferralsService.rewardReferrerIfPending', () => {
  it('does nothing when there is no pending referral', async () => {
    const { grantTemporaryPlanIfNone, service } = makeService({ referrerUserId: null });

    await service.rewardReferrerIfPending('referred-1');

    expect(grantTemporaryPlanIfNone).not.toHaveBeenCalled();
  });

  it('does nothing when no reward plan is configured', async () => {
    const { grantTemporaryPlanIfNone, service } = makeService({ rewardPlanId: null });

    await service.rewardReferrerIfPending('referred-1');

    expect(grantTemporaryPlanIfNone).not.toHaveBeenCalled();
  });

  it('does nothing when reward days is zero', async () => {
    const { grantTemporaryPlanIfNone, service } = makeService({ rewardDays: 0 });

    await service.rewardReferrerIfPending('referred-1');

    expect(grantTemporaryPlanIfNone).not.toHaveBeenCalled();
  });

  it('grants the configured plan to the referrer when everything is configured', async () => {
    const { grantTemporaryPlanIfNone, service } = makeService({
      referrerUserId: 'referrer-1',
      rewardDays: 7,
      rewardPlanId: 'plan-1',
    });

    await service.rewardReferrerIfPending('referred-1');

    expect(grantTemporaryPlanIfNone).toHaveBeenCalledWith('referrer-1', 'plan-1', 7);
  });
});
