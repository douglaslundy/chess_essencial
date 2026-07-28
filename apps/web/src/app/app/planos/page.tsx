'use client';

import { planFeatureCatalog } from '@xadrez/contracts';
import type {
  BillingPeriod,
  SubscriptionPayment,
  SubscriptionPlan,
  UserSubscription,
} from '@xadrez/contracts';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api/client';

function formatPrice(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const paymentStatusLabels: Record<SubscriptionPayment['status'], string> = {
  approved: 'Aprovado',
  cancelled: 'Cancelado',
  expired: 'Expirado',
  pending: 'Pendente',
  refunded: 'Estornado',
  rejected: 'Recusado',
};

const billingPeriodLabels: Record<BillingPeriod, string> = {
  annual: 'Anual',
  monthly: 'Mensal',
};

export default function PlansPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [mySubscription, setMySubscription] = useState<UserSubscription | null>(null);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [message, setMessage] = useState('Carregando planos…');
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const [billingPeriods, setBillingPeriods] = useState<Record<string, BillingPeriod>>({});

  useEffect(() => {
    queueMicrotask(() => {
      const token = window.localStorage.getItem('xadrez.access_token');
      if (!token) {
        setMessage('Entre na sua conta para ver os planos.');
        return;
      }
      Promise.all([
        api.listSubscriptionPlans(token),
        api.getMySubscription(token),
        api.getMySubscriptionPayments(token),
      ])
        .then(([plansResult, subscriptionResult, paymentsResult]) => {
          setPlans(plansResult.items);
          setMySubscription(subscriptionResult);
          setPayments(paymentsResult.items);
          setMessage(plansResult.items.length ? '' : 'Nenhum plano disponível no momento.');
        })
        .catch((error: unknown) =>
          setMessage(error instanceof Error ? error.message : 'Falha ao carregar planos.'),
        );
    });
  }, []);

  async function subscribe(planId: string) {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    const billingPeriod = billingPeriods[planId] ?? 'monthly';
    setBusyPlanId(planId);
    setMessage('Preparando checkout…');
    try {
      const result = await api.createSubscriptionCheckout({ billingPeriod, planId }, token);
      // Full-page redirect to Mercado Pago's external checkout, not an SPA
      // navigation — window.location is the correct API for this.
      // eslint-disable-next-line react-hooks/immutability
      window.location.href = result.checkoutUrl;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível iniciar o pagamento.');
      setBusyPlanId(null);
    }
  }

  return (
    <main className="dashboardPage">
      <header className="pageHeader">
        <h1>Planos</h1>
        <p>Assine um plano para liberar mais acesso diário aos recursos da plataforma.</p>
      </header>
      <p className="plansStatus" role="status">
        {message}
      </p>
      {mySubscription?.plan ? (
        <p className="plansCurrentBanner" role="status">
          Seu plano atual: <strong>{mySubscription.plan.name}</strong>
          {mySubscription.billingPeriod === 'annual' ? ' (anual)' : ''}
          {mySubscription.currentPeriodEnd
            ? ` · válido até ${new Date(mySubscription.currentPeriodEnd).toLocaleDateString('pt-BR')}`
            : ''}
        </p>
      ) : null}
      <div className="plansGrid">
        {plans.map((plan) => {
          const period = billingPeriods[plan.id] ?? 'monthly';
          const hasAnnual = plan.annualPriceCents !== null;
          const isCurrent = mySubscription?.plan?.id === plan.id;
          const displayedPriceCents =
            period === 'annual' && hasAnnual ? plan.annualPriceCents! : plan.priceCents;
          return (
            <article className={`planCard${isCurrent ? ' planCard--current' : ''}`} key={plan.id}>
              {isCurrent ? (
                <span className="planBadge">Seu plano atual</span>
              ) : plan.isDefault ? (
                <span className="planBadge planBadge--free">Gratuito</span>
              ) : null}
              <h2 className="planName">{plan.name}</h2>
              <p className="planPrice">
                <span className="planPriceValue">{formatPrice(displayedPriceCents)}</span>
                <span className="planPricePeriod">/{period === 'annual' ? 'ano' : 'mês'}</span>
              </p>
              {hasAnnual ? (
                <div
                  aria-label={`Periodicidade — ${plan.name}`}
                  className="planBillingToggle"
                  role="group"
                >
                  <button
                    aria-pressed={period === 'monthly'}
                    onClick={() =>
                      setBillingPeriods((current) => ({ ...current, [plan.id]: 'monthly' }))
                    }
                    type="button"
                  >
                    Mensal
                  </button>
                  <button
                    aria-pressed={period === 'annual'}
                    onClick={() =>
                      setBillingPeriods((current) => ({ ...current, [plan.id]: 'annual' }))
                    }
                    type="button"
                  >
                    Anual
                  </button>
                </div>
              ) : null}
              <ul className="planFeatureList">
                {plan.limits.map((limit) => {
                  const label =
                    planFeatureCatalog.find((feature) => feature.key === limit.featureKey)?.label ??
                    limit.featureKey;
                  return (
                    <li key={limit.featureKey}>
                      <span aria-hidden="true" className="planFeatureCheck">
                        ✓
                      </span>
                      <span>
                        {label} —{' '}
                        <strong>
                          {limit.dailyLimit === 0 ? 'ilimitado' : `${limit.dailyLimit}/dia`}
                        </strong>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <button
                className={`planCta${isCurrent ? ' planCta--current' : ''}`}
                disabled={busyPlanId === plan.id || isCurrent}
                onClick={() => void subscribe(plan.id)}
                type="button"
              >
                {isCurrent ? 'Plano atual' : 'Assinar'}
              </button>
            </article>
          );
        })}
      </div>
      {payments.length > 0 ? (
        <section aria-label="Histórico de pagamentos" className="adminHubCard">
          <h2>Histórico de pagamentos</h2>
          <div className="adminUserTable" role="table">
            {payments.map((payment) => (
              <div className="adminUserRow" key={payment.id} role="row">
                <span>{formatPrice(payment.amountCents)}</span>
                <span>{billingPeriodLabels[payment.billingPeriod]}</span>
                <span>{paymentStatusLabels[payment.status]}</span>
                <span>
                  {payment.paidAt ? new Date(payment.paidAt).toLocaleDateString('pt-BR') : '—'}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
