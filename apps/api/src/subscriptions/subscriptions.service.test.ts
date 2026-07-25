import { createHmac } from 'node:crypto';

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
    const service = new SubscriptionsService(repository as never, {} as never, {} as never);

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
    const service = new SubscriptionsService(repository as never, {} as never, {} as never);

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
    const service = new SubscriptionsService(repository as never, {} as never, {} as never);

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
    const service = new SubscriptionsService(repository as never, {} as never, {} as never);

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

describe('SubscriptionsService.verifyWebhookSignature', () => {
  const webhookSecret = 'test-webhook-secret';
  const settings = {
    resolveActiveMercadoPagoConfig: async () => ({
      accessToken: 'token',
      environment: 'sandbox' as const,
      publicKey: null,
      webhookSecret,
    }),
  };

  function makeService() {
    const repository = new FakeSubscriptionsRepository();
    return new SubscriptionsService(repository as never, settings as never, {} as never);
  }

  function sign(dataId: string, requestId: string, ts: string) {
    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
    return createHmac('sha256', webhookSecret).update(manifest).digest('hex');
  }

  it('accepts a correctly signed notification', async () => {
    const service = makeService();
    const ts = '1700000000';
    const v1 = sign('abc123', 'req-1', ts);

    const verified = await service.verifyWebhookSignature(`ts=${ts},v1=${v1}`, 'req-1', 'abc123');

    expect(verified).toBe(true);
  });

  it('rejects a signature computed with the wrong secret', async () => {
    const service = makeService();
    const ts = '1700000000';
    const wrongSignature = createHmac('sha256', 'someone-elses-secret')
      .update(`id:abc123;request-id:req-1;ts:${ts};`)
      .digest('hex');

    const verified = await service.verifyWebhookSignature(
      `ts=${ts},v1=${wrongSignature}`,
      'req-1',
      'abc123',
    );

    expect(verified).toBe(false);
  });

  it('rejects a signature for a different data id (tampered payload)', async () => {
    const service = makeService();
    const ts = '1700000000';
    const v1 = sign('abc123', 'req-1', ts);

    const verified = await service.verifyWebhookSignature(
      `ts=${ts},v1=${v1}`,
      'req-1',
      'someone-elses-id',
    );

    expect(verified).toBe(false);
  });

  it('rejects when no signature header is present', async () => {
    const service = makeService();

    expect(await service.verifyWebhookSignature(undefined, 'req-1', 'abc123')).toBe(false);
  });

  it('rejects when no webhook secret is configured', async () => {
    const repository = new FakeSubscriptionsRepository();
    const unconfigured = {
      resolveActiveMercadoPagoConfig: async () => ({
        accessToken: 'token',
        environment: 'sandbox' as const,
        publicKey: null,
        webhookSecret: null,
      }),
    };
    const service = new SubscriptionsService(
      repository as never,
      unconfigured as never,
      {} as never,
    );
    const ts = '1700000000';
    const v1 = sign('abc123', 'req-1', ts);

    const verified = await service.verifyWebhookSignature(`ts=${ts},v1=${v1}`, 'req-1', 'abc123');

    expect(verified).toBe(false);
  });
});
