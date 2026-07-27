import type {
  BillingPeriod,
  PlanFeatureKey,
  PlanFeatureUsage,
  SaveSubscriptionPlanInput,
  SubscriptionPaymentList,
  UpdateSubscriptionPlanStatusInput,
  UserSubscription,
} from '@xadrez/contracts';
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { SettingsService } from '../settings/settings.service.js';
import { SubscriptionsRepository } from './subscriptions.repository.js';

interface MercadoPagoPreapproval {
  auto_recurring?: { end_date?: string | null; transaction_amount?: number };
  external_reference: string | null;
  id: string;
  status: string;
}

interface MercadoPagoPayment {
  external_reference: string | null;
  id: number;
  status: string;
  transaction_amount: number;
}

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly repository: SubscriptionsRepository,
    private readonly settings: SettingsService,
    private readonly config: ConfigService,
  ) {}

  listPlans() {
    return this.repository.listPlans();
  }

  listActivePlans() {
    return this.repository.listActivePlans();
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
    if (!active) {
      return {
        autoRenew: null,
        billingPeriod: null,
        currentPeriodEnd: null,
        plan: null,
        status: null,
      };
    }
    return {
      autoRenew: active.autoRenew,
      billingPeriod: active.billingPeriod,
      currentPeriodEnd: active.currentPeriodEnd?.toISOString() ?? null,
      plan: active.plan,
      status: active.status as 'active' | 'canceled' | 'expired',
    };
  }

  async listMyPayments(userId: string): Promise<SubscriptionPaymentList> {
    const items = await this.repository.listPaymentsForUser(userId);
    return {
      items: items.map((item) => ({
        amountCents: item.amountCents,
        billingPeriod: item.billingPeriod,
        currency: item.currency,
        id: item.id,
        paidAt: item.paidAt?.toISOString() ?? null,
        provider: item.provider,
        status: item.status,
      })),
    };
  }

  /**
   * Users with no active subscription fall back to the plan marked
   * `isDefault` (the admin-configured "Free" plan) — replacing the earlier
   * "no subscription = unlimited" rule now that plans can gate real
   * features (área 6). If no plan is marked default (misconfiguration),
   * falls back to unrestricted rather than silently locking everyone out.
   */
  async checkEntitlement(userId: string, featureKey: PlanFeatureKey): Promise<PlanFeatureUsage> {
    const active = await this.repository.getActiveSubscriptionForUser(userId);
    const plan = active?.plan ?? (await this.repository.getDefaultPlan());
    if (!plan) return { allowed: true, featureKey, limit: null, used: 0 };
    const limit = plan.limits.find((entry) => entry.featureKey === featureKey);
    if (!limit) return { allowed: false, featureKey, limit: 0, used: 0 };
    if (limit.dailyLimit === 0) return { allowed: true, featureKey, limit: null, used: 0 };
    const used = await this.repository.usageToday(userId, featureKey);
    return { allowed: used < limit.dailyLimit, featureKey, limit: limit.dailyLimit, used };
  }

  grantTemporaryPlanIfNone(userId: string, planId: string, days: number) {
    return this.repository.grantTemporaryPlanIfNone(userId, planId, days);
  }

  adminSetPlan(userId: string, planId: string | null) {
    return this.repository.adminSetPlan(userId, planId);
  }

  expirePastDue() {
    return this.repository.expirePastDue();
  }

  /**
   * Creates a Mercado Pago checkout and returns the URL to redirect the
   * payer to. Monthly uses the Preapproval API (real recurring, auto-charge
   * subscription); annual uses a one-time Payment/Checkout Pro preference —
   * there is no auto-renewal for annual, the user pays again when it
   * expires. NOTE: this talks to a real external API and has not been
   * exercised against Mercado Pago's sandbox from this environment (no
   * credentials configured here) — validate with a real sandbox account
   * before relying on it in production.
   */
  async createCheckout(
    userId: string,
    planId: string,
    billingPeriod: BillingPeriod,
    payerEmail: string,
  ): Promise<{ checkoutUrl: string }> {
    const plan = await this.repository.getPlanById(planId);
    if (!plan || plan.status !== 'active')
      throw new BadRequestException('Plano indisponível para assinatura');
    if (billingPeriod === 'annual' && plan.annualPriceCents === null) {
      throw new BadRequestException('Este plano não tem cobrança anual configurada.');
    }
    const mercadoPago = await this.settings.resolveActiveMercadoPagoConfig();
    const accessToken = mercadoPago?.accessToken;
    if (!accessToken)
      throw new ServiceUnavailableException('Pagamentos não estão configurados no momento');

    const subscriptionId = await this.repository.createPendingSubscription(
      userId,
      planId,
      billingPeriod,
    );
    // Mercado Pago has a single API host; sandbox vs. production is
    // determined by which access token (TEST- vs APP_USR-) is used, not by
    // the URL.
    const webOrigin = this.config.get<string>('WEB_ORIGIN', 'http://localhost:3000');

    if (billingPeriod === 'monthly') {
      return this.createPreapprovalCheckout(
        subscriptionId,
        plan,
        payerEmail,
        accessToken,
        webOrigin,
      );
    }
    return this.createOneTimeCheckout(subscriptionId, plan, accessToken, webOrigin);
  }

  private async createPreapprovalCheckout(
    subscriptionId: string,
    plan: { name: string; priceCents: number },
    payerEmail: string,
    accessToken: string,
    webOrigin: string,
  ): Promise<{ checkoutUrl: string }> {
    let response: Response;
    try {
      response = await fetch('https://api.mercadopago.com/preapproval', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          auto_recurring: {
            currency_id: 'BRL',
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: plan.priceCents / 100,
          },
          back_url: new URL('/app/planos?checkout=concluido', webOrigin).toString(),
          external_reference: subscriptionId,
          payer_email: payerEmail,
          reason: `Xadrez Essencial — ${plan.name}`,
        }),
      });
    } catch (error) {
      throw new ServiceUnavailableException(
        error instanceof Error
          ? `Não foi possível contatar o Mercado Pago: ${error.message}`
          : 'Não foi possível contatar o Mercado Pago.',
      );
    }
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Mercado Pago recusou a criação da assinatura (HTTP ${response.status}).`,
      );
    }
    const body = (await response.json()) as { init_point?: string; id: string };
    if (!body.init_point)
      throw new ServiceUnavailableException('Mercado Pago não retornou o link de pagamento.');
    await this.repository.attachMercadoPagoId(subscriptionId, body.id);
    return { checkoutUrl: body.init_point };
  }

  private async createOneTimeCheckout(
    subscriptionId: string,
    plan: { annualPriceCents: number | null; name: string },
    accessToken: string,
    webOrigin: string,
  ): Promise<{ checkoutUrl: string }> {
    let response: Response;
    try {
      response = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          auto_return: 'approved',
          back_urls: {
            failure: new URL('/app/planos?checkout=falhou', webOrigin).toString(),
            pending: new URL('/app/planos?checkout=pendente', webOrigin).toString(),
            success: new URL('/app/planos?checkout=concluido', webOrigin).toString(),
          },
          external_reference: subscriptionId,
          items: [
            {
              currency_id: 'BRL',
              quantity: 1,
              title: `Xadrez Essencial — ${plan.name} (anual)`,
              unit_price: (plan.annualPriceCents ?? 0) / 100,
            },
          ],
        }),
      });
    } catch (error) {
      throw new ServiceUnavailableException(
        error instanceof Error
          ? `Não foi possível contatar o Mercado Pago: ${error.message}`
          : 'Não foi possível contatar o Mercado Pago.',
      );
    }
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Mercado Pago recusou a criação do pagamento (HTTP ${response.status}).`,
      );
    }
    const body = (await response.json()) as { id: string; init_point?: string };
    if (!body.init_point)
      throw new ServiceUnavailableException('Mercado Pago não retornou o link de pagamento.');
    return { checkoutUrl: body.init_point };
  }

  /**
   * Verifies Mercado Pago's webhook signature (x-signature/x-request-id
   * headers) per their documented HMAC-SHA256 scheme. Returns false (and the
   * caller should reject the request) when no webhook secret is configured
   * — accepting unsigned "payment confirmed" events would be a real
   * vulnerability, so verification is mandatory, not best-effort.
   */
  async verifyWebhookSignature(
    signatureHeader: string | undefined,
    requestId: string | undefined,
    dataId: string,
  ): Promise<boolean> {
    const mercadoPago = await this.settings.resolveActiveMercadoPagoConfig();
    if (!mercadoPago?.webhookSecret || !signatureHeader || !requestId) return false;
    const parts = Object.fromEntries(
      signatureHeader.split(',').map((part) => {
        const [key, value] = part.split('=').map((piece) => piece.trim());
        return [key, value] as [string, string];
      }),
    );
    const ts = parts.ts;
    const v1 = parts.v1;
    if (!ts || !v1) return false;
    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
    const expected = createHmac('sha256', mercadoPago.webhookSecret).update(manifest).digest('hex');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const providedBuffer = Buffer.from(v1, 'utf8');
    if (expectedBuffer.length !== providedBuffer.length) return false;
    return timingSafeEqual(expectedBuffer, providedBuffer);
  }

  /**
   * Dispatches a verified webhook notification by its Mercado Pago `type`:
   * `subscription_preapproval` is the existing monthly recurring flow;
   * `payment` is the one-time annual flow (área 7). Any other/unknown type
   * is ignored — Mercado Pago sends several notification types this
   * integration doesn't use (e.g. `merchant_order`).
   */
  async processMercadoPagoNotification(type: string | undefined, dataId: string): Promise<void> {
    if (type === 'payment') return this.processPaymentNotification(dataId);
    return this.processPreapprovalNotification(dataId);
  }

  private async processPreapprovalNotification(preapprovalId: string): Promise<void> {
    const mercadoPago = await this.settings.resolveActiveMercadoPagoConfig();
    if (!mercadoPago?.accessToken) return;
    const response = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
      headers: { Authorization: `Bearer ${mercadoPago.accessToken}` },
    });
    if (!response.ok) return;
    const preapproval = (await response.json()) as MercadoPagoPreapproval;
    if (preapproval.status === 'authorized' && preapproval.external_reference) {
      const endDate = preapproval.auto_recurring?.end_date;
      const amountCents = Math.round((preapproval.auto_recurring?.transaction_amount ?? 0) * 100);
      await this.repository.activateSubscription(
        preapproval.external_reference,
        preapproval.id,
        endDate ? new Date(endDate) : null,
        amountCents,
        preapproval,
      );
      return;
    }
    if (preapproval.status === 'cancelled') {
      await this.repository.cancelSubscriptionByMercadoPagoId(preapproval.id);
    }
  }

  private async processPaymentNotification(paymentId: string): Promise<void> {
    const mercadoPago = await this.settings.resolveActiveMercadoPagoConfig();
    if (!mercadoPago?.accessToken) return;
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mercadoPago.accessToken}` },
    });
    if (!response.ok) return;
    const payment = (await response.json()) as MercadoPagoPayment;
    if (!payment.external_reference) return;
    const amountCents = Math.round(payment.transaction_amount * 100);
    const providerTransactionId = String(payment.id);

    if (payment.status === 'approved') {
      const activated = await this.repository.activateOneTimePayment(
        payment.external_reference,
        providerTransactionId,
        amountCents,
        payment,
      );
      if (!activated) {
        // Not a still-pending row waiting on its first charge — Mercado
        // Pago also sends a `type=payment` notification for every
        // subsequent monthly renewal of an already-`active` recurring
        // subscription. Without this fallback that renewal was silently
        // dropped: never logged in the ledger, current_period_end never
        // extended.
        await this.repository.recordRecurringRenewal(
          payment.external_reference,
          providerTransactionId,
          amountCents,
          payment,
        );
      }
      return;
    }
    if (payment.status === 'refunded' || payment.status === 'charged_back') {
      await this.repository.refundOneTimePayment(
        payment.external_reference,
        providerTransactionId,
        amountCents,
        payment,
      );
      return;
    }
    if (payment.status === 'rejected' || payment.status === 'cancelled') {
      await this.repository.recordOneTimePaymentEvent(
        payment.external_reference,
        providerTransactionId,
        payment.status,
        amountCents,
        payment,
      );
      return;
    }
    // pending/in_process/in_mediation: recorded so the ledger has a full
    // history even before the payment resolves either way — a later
    // notification for the same payment id updates this same row.
    await this.repository.recordOneTimePaymentEvent(
      payment.external_reference,
      providerTransactionId,
      'pending',
      amountCents,
      payment,
    );
  }
}
