import type {
  PlanFeatureKey,
  PlanFeatureUsage,
  SaveSubscriptionPlanInput,
  UpdateSubscriptionPlanStatusInput,
  UserSubscription,
} from '@xadrez/contracts';
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { SettingsService } from '../settings/settings.service.js';
import { SubscriptionsRepository } from './subscriptions.repository.js';

interface MercadoPagoPreapproval {
  auto_recurring?: { end_date?: string | null };
  external_reference: string | null;
  id: string;
  status: string;
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

  grantTemporaryPlanIfNone(userId: string, planId: string, days: number) {
    return this.repository.grantTemporaryPlanIfNone(userId, planId, days);
  }

  /**
   * Creates a Mercado Pago subscription checkout (Preapproval API) and
   * returns the URL to redirect the payer to. NOTE: this talks to a real
   * external API and has not been exercised against Mercado Pago's sandbox
   * from this environment (no credentials configured here) — validate with
   * a real sandbox account before relying on it in production.
   */
  async createCheckout(
    userId: string,
    planId: string,
    payerEmail: string,
  ): Promise<{ checkoutUrl: string }> {
    const plan = await this.repository.getPlanById(planId);
    if (!plan || plan.status !== 'active')
      throw new BadRequestException('Plano indisponível para assinatura');
    const mercadoPago = await this.settings.resolveActiveMercadoPagoConfig();
    if (!mercadoPago?.accessToken)
      throw new ServiceUnavailableException('Pagamentos não estão configurados no momento');

    const subscriptionId = await this.repository.createPendingSubscription(userId, planId);
    // Mercado Pago has a single API host; sandbox vs. production is
    // determined by which access token (TEST- vs APP_USR-) is used, not by
    // the URL.
    const webOrigin = this.config.get<string>('WEB_ORIGIN', 'http://localhost:3000');

    let response: Response;
    try {
      response = await fetch('https://api.mercadopago.com/preapproval', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${mercadoPago.accessToken}`,
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
   * Fetches the full preapproval from Mercado Pago and activates or
   * cancels the local subscription accordingly. Called after signature
   * verification succeeds.
   */
  async processMercadoPagoNotification(preapprovalId: string): Promise<void> {
    const mercadoPago = await this.settings.resolveActiveMercadoPagoConfig();
    if (!mercadoPago?.accessToken) return;
    const response = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
      headers: { Authorization: `Bearer ${mercadoPago.accessToken}` },
    });
    if (!response.ok) return;
    const preapproval = (await response.json()) as MercadoPagoPreapproval;
    if (preapproval.status === 'authorized' && preapproval.external_reference) {
      const endDate = preapproval.auto_recurring?.end_date;
      await this.repository.activateSubscription(
        preapproval.external_reference,
        preapproval.id,
        endDate ? new Date(endDate) : null,
      );
      return;
    }
    if (preapproval.status === 'cancelled') {
      await this.repository.cancelSubscriptionByMercadoPagoId(preapproval.id);
    }
  }
}
