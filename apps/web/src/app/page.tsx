import {
  planFeatureCatalog,
  subscriptionPlanListSchema,
  type SubscriptionPlan,
} from '@xadrez/contracts';
import Link from 'next/link';

import { SessionRedirect } from '@/components/auth/session-redirect';
import { webEnv } from '@/env';

const highlights = [
  'Partidas ao vivo com regras e relógio validados pelo servidor, ou contra bots',
  'Curso do zero, exercícios e desafios progressivos, do iniciante ao avançado',
  'Aberturas e armadilhas para estudar, com treino guiado',
  'Biblioteca de partidas de grandes mestres com revisão comentada por IA',
  'Sala de aula com tutor de IA e acompanhamento do seu progresso',
];

// Revalidated page-side so admin price changes reach the landing without a rebuild.
async function loadPlans(): Promise<SubscriptionPlan[]> {
  try {
    const response = await fetch(`${webEnv.NEXT_PUBLIC_API_URL}/public/subscription-plans`, {
      next: { revalidate: 300 },
    });
    if (!response.ok) return [];
    const parsed = subscriptionPlanListSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.items : [];
  } catch {
    return [];
  }
}

function formatPrice(cents: number) {
  return cents === 0
    ? 'Grátis'
    : (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default async function HomePage() {
  const plans = await loadPlans();
  return (
    <main className="landingPage">
      <SessionRedirect />
      <header className="landingBar">
        <Link className="landingBrand" href="/">
          <span>XE</span>
          <strong>Xadrez Essencial</strong>
        </Link>
        <nav aria-label="Acesso">
          <Link className="secondaryButton" href="/entrar">
            Entrar
          </Link>
          <Link className="primaryButton" href="/entrar">
            Criar conta grátis
          </Link>
        </nav>
      </header>

      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">Plataforma de xadrez</p>
        <h1 id="page-title">Aprenda e jogue xadrez do jeito certo</h1>
        <p className="lead">
          Aulas, exercícios e desafios organizados por dificuldade, partidas ao vivo com regras e
          tempo validados pelo servidor, e ranking para acompanhar sua evolução.
        </p>
        <div className="landingCtas">
          <Link className="primaryButton" href="/entrar">
            Começar agora
          </Link>
        </div>
      </section>

      <section className="panel" aria-labelledby="highlights-title">
        <h2 id="highlights-title">O que você encontra na plataforma</h2>
        <ul>
          {highlights.map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>
      </section>

      {plans.length > 0 ? (
        <section aria-labelledby="plans-title" className="landingPlans">
          <h2 id="plans-title">Planos</h2>
          <div className="plansGrid">
            {plans.map((plan) => (
              <article className="planCard" key={plan.id}>
                {plan.isDefault ? (
                  <span className="planBadge planBadge--free">Gratuito</span>
                ) : null}
                <h3 className="planName">{plan.name}</h3>
                <p className="planPrice">
                  <span className="planPriceValue">{formatPrice(plan.priceCents)}</span>
                  {plan.priceCents > 0 ? <span className="planPricePeriod">/mês</span> : null}
                </p>
                {plan.annualPriceCents ? <p>ou {formatPrice(plan.annualPriceCents)}/ano</p> : null}
                <ul className="planFeatureList">
                  {plan.limits.map((limit) => {
                    const label =
                      planFeatureCatalog.find((feature) => feature.key === limit.featureKey)
                        ?.label ?? limit.featureKey;
                    return (
                      <li key={limit.featureKey}>
                        <span aria-hidden="true" className="planFeatureCheck">
                          ✓
                        </span>
                        <span>
                          {label}
                          {limit.featureKey.endsWith('_per_day') ? (
                            <>
                              {' — '}
                              <strong>
                                {limit.dailyLimit === 0 ? 'ilimitado' : `${limit.dailyLimit}/dia`}
                              </strong>
                            </>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <Link className="planCta" href="/entrar">
                  {plan.priceCents === 0 ? 'Criar conta grátis' : 'Assinar'}
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <footer className="landingFooter">
        <Link href="/regras">Regras da comunidade</Link>
      </footer>
    </main>
  );
}
