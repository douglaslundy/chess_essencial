import { createHmac } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PlanWithLimits } from './subscriptions.repository.js';
import { SubscriptionsService } from './subscriptions.service.js';

interface ActiveSubscription {
  autoRenew: boolean;
  billingPeriod: 'monthly' | 'annual';
  currentPeriodEnd: Date | null;
  plan: PlanWithLimits;
  status: string;
}

class FakeSubscriptionsRepository {
  active: ActiveSubscription | null = null;
  defaultPlan: PlanWithLimits | null = null;
  usage = 0;
  // Simulates whether activateOneTimePayment finds a matching `pending` row
  // — false reproduces the "already active" case a renewal notification
  // hits (bug 1's regression scenario).
  hasPendingRowToActivate = true;
  activatedOneTimePayments: {
    amountCents: number;
    externalReference: string;
    providerTransactionId: string;
    rawNotification: unknown;
  }[] = [];
  recordedEvents: {
    amountCents: number;
    externalReference: string;
    providerTransactionId: string;
    rawNotification: unknown;
    status: string;
  }[] = [];
  refundedPayments: {
    amountCents: number;
    externalReference: string;
    providerTransactionId: string;
    rawNotification: unknown;
  }[] = [];
  recordedRenewals: {
    amountCents: number;
    externalReference: string;
    providerTransactionId: string;
    rawNotification: unknown;
  }[] = [];

  async getActiveSubscriptionForUser() {
    return this.active;
  }

  async getDefaultPlan() {
    return this.defaultPlan;
  }

  async usageToday() {
    return this.usage;
  }

  async activateOneTimePayment(
    externalReference: string,
    providerTransactionId: string,
    amountCents: number,
    rawNotification: unknown,
  ) {
    if (!this.hasPendingRowToActivate) return null;
    this.activatedOneTimePayments.push({
      amountCents,
      externalReference,
      providerTransactionId,
      rawNotification,
    });
    return { planId: 'plan-1', userId: 'user-1' };
  }

  async recordRecurringRenewal(
    externalReference: string,
    providerTransactionId: string,
    amountCents: number,
    rawNotification: unknown,
  ) {
    this.recordedRenewals.push({
      amountCents,
      externalReference,
      providerTransactionId,
      rawNotification,
    });
    return true;
  }

  async recordOneTimePaymentEvent(
    externalReference: string,
    providerTransactionId: string,
    status: string,
    amountCents: number,
    rawNotification: unknown,
  ) {
    this.recordedEvents.push({
      amountCents,
      externalReference,
      providerTransactionId,
      rawNotification,
      status,
    });
  }

  async refundOneTimePayment(
    externalReference: string,
    providerTransactionId: string,
    amountCents: number,
    rawNotification: unknown,
  ) {
    this.refundedPayments.push({
      amountCents,
      externalReference,
      providerTransactionId,
      rawNotification,
    });
  }
}

function plan(
  limits: PlanWithLimits['limits'],
  overrides: Partial<PlanWithLimits> = {},
): PlanWithLimits {
  return {
    annualPriceCents: null,
    id: 'plan-1',
    isDefault: false,
    limits,
    name: 'Plano',
    priceCents: 0,
    slug: 'plano',
    status: 'active',
    ...overrides,
  };
}

function active(planWithLimits: PlanWithLimits): ActiveSubscription {
  return {
    autoRenew: true,
    billingPeriod: 'monthly',
    currentPeriodEnd: null,
    plan: planWithLimits,
    status: 'active',
  };
}

describe('SubscriptionsService.checkEntitlement', () => {
  it('allows everything when there is no active subscription and no default plan configured', async () => {
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

  it('falls back to the default plan when the user has no active subscription', async () => {
    const repository = new FakeSubscriptionsRepository();
    repository.defaultPlan = plan([{ dailyLimit: 2, featureKey: 'exercises_per_day' }], {
      id: 'free-plan',
      isDefault: true,
    });

    const service = new SubscriptionsService(repository as never, {} as never, {} as never);

    repository.usage = 1;
    expect(await service.checkEntitlement('user-1', 'exercises_per_day')).toMatchObject({
      allowed: true,
      limit: 2,
      used: 1,
    });

    repository.usage = 2;
    expect(await service.checkEntitlement('user-1', 'exercises_per_day')).toMatchObject({
      allowed: false,
      limit: 2,
      used: 2,
    });

    // The default plan doesn't include social_access at all — absent from a
    // plan's limits means not granted, same rule as for a paid plan.
    expect(await service.checkEntitlement('user-1', 'social_access')).toEqual({
      allowed: false,
      featureKey: 'social_access',
      limit: 0,
      used: 0,
    });
  });

  it('prefers the active paid subscription over the default plan', async () => {
    const repository = new FakeSubscriptionsRepository();
    repository.defaultPlan = plan([], { id: 'free-plan', isDefault: true });
    repository.active = active(
      plan([{ dailyLimit: 0, featureKey: 'social_access' }], { id: 'paid-plan' }),
    );

    const service = new SubscriptionsService(repository as never, {} as never, {} as never);

    expect(await service.checkEntitlement('user-1', 'social_access')).toEqual({
      allowed: true,
      featureKey: 'social_access',
      limit: null,
      used: 0,
    });
  });

  it('blocks a feature the active plan does not include', async () => {
    const repository = new FakeSubscriptionsRepository();
    repository.active = active(plan([]));
    const service = new SubscriptionsService(repository as never, {} as never, {} as never);

    const result = await service.checkEntitlement('user-1', 'games_per_day');

    expect(result).toEqual({ allowed: false, featureKey: 'games_per_day', limit: 0, used: 0 });
  });

  it('treats a daily limit of 0 as unlimited', async () => {
    const repository = new FakeSubscriptionsRepository();
    repository.active = active(plan([{ dailyLimit: 0, featureKey: 'exercises_per_day' }]));
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
    repository.active = active(plan([{ dailyLimit: 3, featureKey: 'lessons_per_day' }]));
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

describe('SubscriptionsService.processMercadoPagoNotification (type=payment, one-time annual)', () => {
  const settings = {
    resolveActiveMercadoPagoConfig: async () => ({
      accessToken: 'token',
      environment: 'sandbox' as const,
      publicKey: null,
      webhookSecret: 'secret',
    }),
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockPaymentFetch(payment: Record<string, unknown>) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: async () => payment, ok: true } as Response),
    );
  }

  it('activates the subscription on an approved payment', async () => {
    const payment = {
      external_reference: 'sub-1',
      id: 555,
      status: 'approved',
      transaction_amount: 199,
    };
    mockPaymentFetch(payment);
    const repository = new FakeSubscriptionsRepository();
    const service = new SubscriptionsService(repository as never, settings as never, {} as never);

    await service.processMercadoPagoNotification('payment', '555');

    // Bug 3: the raw webhook payload must be forwarded for audit/debug
    // (subscription_payments.raw_notification), not just the fields the
    // service happens to read out of it.
    expect(repository.activatedOneTimePayments).toEqual([
      { amountCents: 19_900, externalReference: 'sub-1', providerTransactionId: '555', rawNotification: payment },
    ]);
    // Already activated via the pending-row lookup — no fallback renewal.
    expect(repository.recordedRenewals).toEqual([]);
  });

  it('records a pending payment without activating anything', async () => {
    const payment = {
      external_reference: 'sub-2',
      id: 556,
      status: 'in_process',
      transaction_amount: 199,
    };
    mockPaymentFetch(payment);
    const repository = new FakeSubscriptionsRepository();
    const service = new SubscriptionsService(repository as never, settings as never, {} as never);

    await service.processMercadoPagoNotification('payment', '556');

    expect(repository.activatedOneTimePayments).toEqual([]);
    expect(repository.recordedEvents).toEqual([
      {
        amountCents: 19_900,
        externalReference: 'sub-2',
        providerTransactionId: '556',
        rawNotification: payment,
        status: 'pending',
      },
    ]);
  });

  it('records a rejected payment without activating anything', async () => {
    const payment = {
      external_reference: 'sub-3',
      id: 557,
      status: 'rejected',
      transaction_amount: 199,
    };
    mockPaymentFetch(payment);
    const repository = new FakeSubscriptionsRepository();
    const service = new SubscriptionsService(repository as never, settings as never, {} as never);

    await service.processMercadoPagoNotification('payment', '557');

    expect(repository.activatedOneTimePayments).toEqual([]);
    expect(repository.recordedEvents).toEqual([
      {
        amountCents: 19_900,
        externalReference: 'sub-3',
        providerTransactionId: '557',
        rawNotification: payment,
        status: 'rejected',
      },
    ]);
  });

  it('cancels the subscription and records a refund when a payment is refunded', async () => {
    const payment = {
      external_reference: 'sub-4',
      id: 558,
      status: 'refunded',
      transaction_amount: 199,
    };
    mockPaymentFetch(payment);
    const repository = new FakeSubscriptionsRepository();
    const service = new SubscriptionsService(repository as never, settings as never, {} as never);

    await service.processMercadoPagoNotification('payment', '558');

    expect(repository.refundedPayments).toEqual([
      { amountCents: 19_900, externalReference: 'sub-4', providerTransactionId: '558', rawNotification: payment },
    ]);
  });

  // Bug 1: Mercado Pago fires a `type=payment` notification for every
  // monthly renewal, not just the subscription's first charge. By the time
  // a renewal lands, the local row is already `active` (not `pending`), so
  // activateOneTimePayment's pending-row lookup finds nothing. Before this
  // fix that meant the renewal was dropped — never recorded in the ledger,
  // current_period_end never extended.
  it('records a recurring renewal when the payment is approved for an already-active subscription', async () => {
    const payment = {
      external_reference: 'sub-active-1',
      id: 999,
      status: 'approved',
      transaction_amount: 49.9,
    };
    mockPaymentFetch(payment);
    const repository = new FakeSubscriptionsRepository();
    repository.hasPendingRowToActivate = false;
    const service = new SubscriptionsService(repository as never, settings as never, {} as never);

    await service.processMercadoPagoNotification('payment', '999');

    expect(repository.activatedOneTimePayments).toEqual([]);
    expect(repository.recordedRenewals).toEqual([
      {
        amountCents: 4_990,
        externalReference: 'sub-active-1',
        providerTransactionId: '999',
        rawNotification: payment,
      },
    ]);
  });

  it('ignores a notification with no external reference', async () => {
    mockPaymentFetch({
      external_reference: null,
      id: 559,
      status: 'approved',
      transaction_amount: 199,
    });
    const repository = new FakeSubscriptionsRepository();
    const service = new SubscriptionsService(repository as never, settings as never, {} as never);

    await service.processMercadoPagoNotification('payment', '559');

    expect(repository.activatedOneTimePayments).toEqual([]);
  });
});
