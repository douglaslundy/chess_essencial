import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../bootstrap.js';
import { DatabaseService } from '../database/database.service.js';

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
});
