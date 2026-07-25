'use client';

import { planFeatureCatalog } from '@xadrez/contracts';
import type { SubscriptionPlan, UserSubscription } from '@xadrez/contracts';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api/client';

function formatPrice(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function PlansPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [mySubscription, setMySubscription] = useState<UserSubscription | null>(null);
  const [message, setMessage] = useState('Carregando planos…');
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      const token = window.localStorage.getItem('xadrez.access_token');
      if (!token) {
        setMessage('Entre na sua conta para ver os planos.');
        return;
      }
      Promise.all([api.listSubscriptionPlans(token), api.getMySubscription(token)])
        .then(([plansResult, subscriptionResult]) => {
          setPlans(plansResult.items);
          setMySubscription(subscriptionResult);
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
    setBusyPlanId(planId);
    setMessage('Preparando checkout…');
    try {
      const result = await api.createSubscriptionCheckout({ planId }, token);
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
          {mySubscription.currentPeriodEnd
            ? ` · válido até ${new Date(mySubscription.currentPeriodEnd).toLocaleDateString('pt-BR')}`
            : ''}
        </p>
      ) : null}
      <div className="adminHubGrid">
        {plans.map((plan) => (
          <div className="adminHubCard" key={plan.id}>
            <strong>{plan.name}</strong>
            <span>{formatPrice(plan.priceCents)} / mês</span>
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
        ))}
      </div>
    </main>
  );
}
