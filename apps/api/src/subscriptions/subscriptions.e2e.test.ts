import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../bootstrap.js';
import { DatabaseService } from '../database/database.service.js';
import { SubscriptionsRepository } from './subscriptions.repository.js';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

interface Identity {
  accessToken: string;
  userId: string;
}

describeDatabase('subscription plans database integration (área 6/7)', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let database: DatabaseService;
  let admin: Identity;
  let member: Identity;
  const createdPlanIds: string[] = [];

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    database = app.get(DatabaseService);
    admin = await createIdentity('billing-admin@example.com', 'billing_admin');
    member = await createIdentity('billing-member@example.com', 'billing_member');
    await database.client`
      INSERT INTO user_roles (user_id, role) VALUES (${admin.userId}, 'admin')
      ON CONFLICT DO NOTHING
    `;
  });

  afterAll(async () => {
    if (createdPlanIds.length > 0) {
      await database.client`
        DELETE FROM subscription_plans WHERE id = ANY(${database.client.array(createdPlanIds)}::uuid[])
      `;
    }
    await app.close();
  });

  function auth(identity: Identity) {
    return { authorization: `Bearer ${identity.accessToken}` };
  }

  async function createIdentity(email: string, username: string): Promise<Identity> {
    const registration = await app.inject({
      method: 'POST',
      payload: { displayName: username, email, password: 'billing integration password', username },
      url: '/v1/auth/register',
    });
    expect(registration.statusCode, registration.body).toBe(201);
    const registered = registration.json();
    await app.inject({
      method: 'POST',
      payload: { token: registered.verificationToken },
      url: '/v1/auth/verify',
    });
    const login = await app.inject({
      method: 'POST',
      payload: { identifier: email, password: 'billing integration password' },
      url: '/v1/auth/login',
    });
    expect(login.statusCode, login.body).toBe(200);
    return { accessToken: login.json().tokens.accessToken, userId: registered.user.id };
  }

  it('creates a plan with an annual price alongside the monthly one', async () => {
    const response = await app.inject({
      headers: auth(admin),
      method: 'POST',
      payload: {
        annualPriceCents: 19_900,
        limits: [{ dailyLimit: 5, featureKey: 'exercises_per_day' }],
        name: 'Plano Anual de Teste',
        priceCents: 1_990,
      },
      url: '/v1/admin/subscription-plans',
    });
    expect(response.statusCode, response.body).toBe(201);
    const plan = response.json();
    createdPlanIds.push(plan.id);
    expect(plan).toMatchObject({ annualPriceCents: 19_900, isDefault: false, priceCents: 1_990 });
  });

  it('enforces at most one default plan, clearing the previous one when a new default is saved', async () => {
    const first = await app.inject({
      headers: auth(admin),
      method: 'POST',
      payload: { isDefault: true, limits: [], name: 'Free A', priceCents: 0 },
      url: '/v1/admin/subscription-plans',
    });
    expect(first.statusCode, first.body).toBe(201);
    const planA = first.json();
    createdPlanIds.push(planA.id);
    expect(planA.isDefault).toBe(true);

    const second = await app.inject({
      headers: auth(admin),
      method: 'POST',
      payload: { isDefault: true, limits: [], name: 'Free B', priceCents: 0 },
      url: '/v1/admin/subscription-plans',
    });
    expect(second.statusCode, second.body).toBe(201);
    const planB = second.json();
    createdPlanIds.push(planB.id);
    expect(planB.isDefault).toBe(true);

    const [reloadedA] = await database.client<{ isDefault: boolean }[]>`
      SELECT is_default AS "isDefault" FROM subscription_plans WHERE id = ${planA.id}
    `;
    expect(reloadedA!.isDefault).toBe(false);

    const [defaultCount] = await database.client<{ count: number }[]>`
      SELECT count(*)::integer AS count FROM subscription_plans WHERE is_default = true
    `;
    expect(defaultCount!.count).toBe(1);
  });

  it('applies the default plan entitlement to a user with no active subscription', async () => {
    const created = await app.inject({
      headers: auth(admin),
      method: 'POST',
      payload: {
        isDefault: true,
        limits: [{ dailyLimit: 1, featureKey: 'exercises_per_day' }],
        name: 'Free C',
        priceCents: 0,
      },
      url: '/v1/admin/subscription-plans',
    });
    expect(created.statusCode, created.body).toBe(201);
    createdPlanIds.push(created.json().id);

    // member has no active subscription — this now resolves through the
    // default plan instead of the old "always unlimited" fallback.
    const before = await database.client<{ count: number }[]>`
      SELECT count(*)::integer AS count FROM exercise_attempts WHERE user_id = ${member.userId}
    `;
    expect(before[0]!.count).toBe(0);
  });

  it('site admins bypass every plan limit through the real API, even one their own default plan denies outright', async () => {
    const created = await app.inject({
      headers: auth(admin),
      method: 'POST',
      payload: { isDefault: true, limits: [], name: 'Free D (sem partidas)', priceCents: 0 },
      url: '/v1/admin/subscription-plans',
    });
    expect(created.statusCode, created.body).toBe(201);
    createdPlanIds.push(created.json().id);

    // A plain member has no active subscription, so they fall back to this
    // default plan - which doesn't include games_per_day at all, so it's
    // blocked outright (absent from a plan's limits = not granted, same
    // rule already covered above for exercises_per_day/social_access).
    const memberAttempt = await app.inject({
      headers: auth(member),
      method: 'POST',
      payload: { botDifficulty: 'beginner', playerColor: 'white', timeControlCode: 'blitz-3-0' },
      url: '/v1/matchmaking/bot-games',
    });
    expect(memberAttempt.statusCode, memberAttempt.body).toBe(403);

    // The admin has the exact same (lack of) subscription, so the exact
    // same default plan applies to them too - but admins bypass every
    // plan limit regardless of what plan is attached to their account.
    const adminAttempt = await app.inject({
      headers: auth(admin),
      method: 'POST',
      payload: { botDifficulty: 'beginner', playerColor: 'white', timeControlCode: 'blitz-3-0' },
      url: '/v1/matchmaking/bot-games',
    });
    expect(adminAttempt.statusCode, adminAttempt.body).toBe(201);
  });

  it('rejects a duplicate payment ledger row for the same provider transaction id (idempotency)', async () => {
    const plan = await app.inject({
      headers: auth(admin),
      method: 'POST',
      payload: { limits: [], name: 'Plano Idempotência', priceCents: 500 },
      url: '/v1/admin/subscription-plans',
    });
    createdPlanIds.push(plan.json().id);

    const [subscription] = await database.client<{ id: string }[]>`
      INSERT INTO user_subscriptions (user_id, plan_id, status)
      VALUES (${member.userId}, ${plan.json().id}, 'pending')
      RETURNING id
    `;
    await database.client`
      INSERT INTO subscription_payments
        (subscription_id, provider_transaction_id, status, amount_cents, billing_period)
      VALUES (${subscription!.id}, 'mp-payment-idempotency-1', 'approved', 500, 'monthly')
    `;
    await expect(
      database.client`
        INSERT INTO subscription_payments
          (subscription_id, provider_transaction_id, status, amount_cents, billing_period)
        VALUES (${subscription!.id}, 'mp-payment-idempotency-1', 'approved', 500, 'monthly')
      `,
    ).rejects.toThrow();

    await database.client`DELETE FROM user_subscriptions WHERE id = ${subscription!.id}`;
  });

  it('forbids non-admins from creating plans', async () => {
    const response = await app.inject({
      headers: auth(member),
      method: 'POST',
      payload: { limits: [], name: 'Não deveria criar', priceCents: 0 },
      url: '/v1/admin/subscription-plans',
    });
    expect(response.statusCode).toBe(403);
  });

  // Bug 1 (monthly renewal ledger) + Bug 3 (raw_notification always saved).
  it('records a recurring renewal for an already-active monthly subscription and extends the period', async () => {
    const plan = await app.inject({
      headers: auth(admin),
      method: 'POST',
      payload: { limits: [], name: 'Plano Renovação Mensal', priceCents: 990 },
      url: '/v1/admin/subscription-plans',
    });
    createdPlanIds.push(plan.json().id);

    const originalPeriodEnd = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const [subscription] = await database.client<{ id: string }[]>`
      INSERT INTO user_subscriptions
        (user_id, plan_id, status, billing_period, auto_renew, current_period_end)
      VALUES (${member.userId}, ${plan.json().id}, 'active', 'monthly', true, ${originalPeriodEnd})
      RETURNING id
    `;
    const subscriptionId = subscription!.id;
    const repository = app.get(SubscriptionsRepository);

    // activateOneTimePayment must NOT find this row (it's active, not
    // pending) — this reproduces exactly what used to make the renewal
    // vanish before the fix.
    const notActivated = await repository.activateOneTimePayment(
      subscriptionId,
      'mp-renewal-not-pending',
      990,
      { note: 'should not activate' },
    );
    expect(notActivated).toBeNull();

    const rawNotification = { id: 'renewal-1', status: 'approved', type: 'payment' };
    const recorded = await repository.recordRecurringRenewal(
      subscriptionId,
      'mp-renewal-1',
      990,
      rawNotification,
    );
    expect(recorded).toBe(true);

    const [payment] = await database.client<
      { amountCents: number; rawNotification: unknown; status: string }[]
    >`
      SELECT amount_cents AS "amountCents", status, raw_notification AS "rawNotification"
      FROM subscription_payments
      WHERE subscription_id = ${subscriptionId} AND provider_transaction_id = 'mp-renewal-1'
    `;
    expect(payment).toMatchObject({ amountCents: 990, status: 'approved' });
    expect(payment!.rawNotification).toEqual(rawNotification);

    const [updated] = await database.client<{ currentPeriodEnd: Date }[]>`
      SELECT current_period_end AS "currentPeriodEnd" FROM user_subscriptions WHERE id = ${subscriptionId}
    `;
    expect(updated!.currentPeriodEnd.getTime()).toBeGreaterThan(originalPeriodEnd.getTime());

    // Re-delivering the same webhook notification must not create a
    // second ledger row nor push the period out again.
    const recordedAgain = await repository.recordRecurringRenewal(
      subscriptionId,
      'mp-renewal-1',
      990,
      rawNotification,
    );
    expect(recordedAgain).toBe(false);
    const [afterRetry] = await database.client<{ currentPeriodEnd: Date }[]>`
      SELECT current_period_end AS "currentPeriodEnd" FROM user_subscriptions WHERE id = ${subscriptionId}
    `;
    expect(afterRetry!.currentPeriodEnd.getTime()).toBe(updated!.currentPeriodEnd.getTime());
    const [renewalCount] = await database.client<{ count: number }[]>`
      SELECT count(*)::integer AS count FROM subscription_payments WHERE subscription_id = ${subscriptionId}
    `;
    expect(renewalCount!.count).toBe(1);

    await database.client`DELETE FROM user_subscriptions WHERE id = ${subscriptionId}`;
  });

  // Bug 2 (expired status written to the ledger) + Bug 3 (raw_notification).
  it('logs an expired ledger row when a past-due subscription is flipped to expired', async () => {
    const plan = await app.inject({
      headers: auth(admin),
      method: 'POST',
      payload: { limits: [], name: 'Plano Expiração', priceCents: 500 },
      url: '/v1/admin/subscription-plans',
    });
    createdPlanIds.push(plan.json().id);

    const pastPeriodEnd = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [subscription] = await database.client<{ id: string }[]>`
      INSERT INTO user_subscriptions
        (user_id, plan_id, status, billing_period, auto_renew, current_period_end)
      VALUES (${member.userId}, ${plan.json().id}, 'active', 'monthly', true, ${pastPeriodEnd})
      RETURNING id
    `;
    const subscriptionId = subscription!.id;
    const repository = app.get(SubscriptionsRepository);

    const expiredCount = await repository.expirePastDue();
    expect(expiredCount).toBeGreaterThanOrEqual(1);

    const [reloaded] = await database.client<{ status: string }[]>`
      SELECT status FROM user_subscriptions WHERE id = ${subscriptionId}
    `;
    expect(reloaded!.status).toBe('expired');

    const [payment] = await database.client<
      { amountCents: number; rawNotification: unknown; status: string }[]
    >`
      SELECT amount_cents AS "amountCents", status, raw_notification AS "rawNotification"
      FROM subscription_payments WHERE subscription_id = ${subscriptionId}
    `;
    expect(payment).toMatchObject({ amountCents: 0, status: 'expired' });
    expect(payment!.rawNotification).not.toBeNull();
    expect(payment!.rawNotification).toMatchObject({ reason: 'current_period_end_passed' });

    // Idempotent: running the job again doesn't touch an already-expired
    // subscription, so no second ledger row is created for it.
    await repository.expirePastDue();
    const [expiredLedgerCount] = await database.client<{ count: number }[]>`
      SELECT count(*)::integer AS count FROM subscription_payments WHERE subscription_id = ${subscriptionId}
    `;
    expect(expiredLedgerCount!.count).toBe(1);

    await database.client`DELETE FROM user_subscriptions WHERE id = ${subscriptionId}`;
  });
});
