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
      <p role="status">{message}</p>
      {mySubscription?.plan ? (
        <p role="status">
          Seu plano atual: <strong>{mySubscription.plan.name}</strong>
          {mySubscription.billingPeriod === 'annual' ? ' (anual)' : ''}
          {mySubscription.currentPeriodEnd
            ? ` · válido até ${new Date(mySubscription.currentPeriodEnd).toLocaleDateString('pt-BR')}`
            : ''}
        </p>
      ) : null}
      <div className="adminHubGrid">
        {plans.map((plan) => {
          const period = billingPeriods[plan.id] ?? 'monthly';
          const hasAnnual = plan.annualPriceCents !== null;
          return (
            <div className="adminHubCard" key={plan.id}>
              <strong>{plan.name}</strong>
              {hasAnnual ? (
                <div role="radiogroup" aria-label={`Periodicidade — ${plan.name}`}>
                  <label>
                    <input
                      checked={period === 'monthly'}
                      name={`billing-${plan.id}`}
                      onChange={() =>
                        setBillingPeriods((current) => ({ ...current, [plan.id]: 'monthly' }))
                      }
                      type="radio"
                    />{' '}
                    Mensal — {formatPrice(plan.priceCents)}/mês
                  </label>
                  <label>
                    <input
                      checked={period === 'annual'}
                      name={`billing-${plan.id}`}
                      onChange={() =>
                        setBillingPeriods((current) => ({ ...current, [plan.id]: 'annual' }))
                      }
                      type="radio"
                    />{' '}
                    Anual (pagamento único) — {formatPrice(plan.annualPriceCents!)}/ano
                  </label>
                </div>
              ) : (
                <span>{formatPrice(plan.priceCents)} / mês</span>
              )}
              <ul>
                {plan.limits.map((limit) => {
                  const label =
                    planFeatureCatalog.find((feature) => feature.key === limit.featureKey)?.label ??
                    limit.featureKey;
                  return (
                    <li key={limit.featureKey}>
                      {label}: {limit.dailyLimit === 0 ? 'ilimitado' : `${limit.dailyLimit}/dia`}
                    </li>
                  );
                })}
              </ul>
              <button
                disabled={busyPlanId === plan.id || mySubscription?.plan?.id === plan.id}
                onClick={() => void subscribe(plan.id)}
                type="button"
              >
                {mySubscription?.plan?.id === plan.id ? 'Plano atual' : 'Assinar'}
              </button>
            </div>
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
