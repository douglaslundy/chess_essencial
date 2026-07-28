'use client';

import { planFeatureCatalog } from '@xadrez/contracts';
import type { PlanFeatureKey, SubscriptionPlan } from '@xadrez/contracts';
import { useEffect, useState, type FormEvent } from 'react';

import { api } from '@/lib/api/client';
import styles from '@/components/portal/portal-pages.module.css';

type FeatureFormState = Record<PlanFeatureKey, { dailyLimit: string; included: boolean }>;

function emptyFeatureState(): FeatureFormState {
  return Object.fromEntries(
    planFeatureCatalog.map((feature) => [feature.key, { dailyLimit: '0', included: false }]),
  ) as FeatureFormState;
}

function planToFeatureState(plan: SubscriptionPlan): FeatureFormState {
  const state = emptyFeatureState();
  for (const limit of plan.limits) {
    state[limit.featureKey as PlanFeatureKey] = {
      dailyLimit: String(limit.dailyLimit),
      included: true,
    };
  }
  return state;
}

export default function AdminSubscriptionPlansPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [message, setMessage] = useState('Carregando planos…');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [priceReais, setPriceReais] = useState('0');
  const [annualPriceReais, setAnnualPriceReais] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [features, setFeatures] = useState<FeatureFormState>(emptyFeatureState());

  function token() {
    return window.localStorage.getItem('xadrez.access_token');
  }

  useEffect(() => {
    queueMicrotask(() => {
      const accessToken = token();
      if (!accessToken) {
        setMessage('Entre com uma conta de administrador.');
        return;
      }
      api
        .adminListSubscriptionPlans(accessToken)
        .then((result) => {
          setPlans(result.items);
          setMessage(result.items.length ? '' : 'Nenhum plano criado ainda.');
        })
        .catch((error: unknown) =>
          setMessage(error instanceof Error ? error.message : 'Falha ao carregar planos.'),
        );
    });
  }, []);

  function startCreate() {
    setEditingId(null);
    setName('');
    setPriceReais('0');
    setAnnualPriceReais('');
    setIsDefault(false);
    setFeatures(emptyFeatureState());
  }

  function startEdit(plan: SubscriptionPlan) {
    setEditingId(plan.id);
    setName(plan.name);
    setPriceReais((plan.priceCents / 100).toFixed(2));
    setAnnualPriceReais(
      plan.annualPriceCents === null ? '' : (plan.annualPriceCents / 100).toFixed(2),
    );
    setIsDefault(plan.isDefault);
    setFeatures(planToFeatureState(plan));
  }

  function toggleFeature(key: PlanFeatureKey) {
    setFeatures((current) => ({
      ...current,
      [key]: { ...current[key]!, included: !current[key]!.included },
    }));
  }

  function setFeatureLimit(key: PlanFeatureKey, dailyLimit: string) {
    setFeatures((current) => ({ ...current, [key]: { ...current[key]!, dailyLimit } }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const accessToken = token();
    if (!accessToken) return;
    const priceCents = Math.round(Number(priceReais.replace(',', '.')) * 100);
    const annualPriceCents = annualPriceReais.trim()
      ? Math.round(Number(annualPriceReais.replace(',', '.')) * 100)
      : null;
    const limits = planFeatureCatalog
      .filter((feature) => features[feature.key]!.included)
      .map((feature) => ({
        dailyLimit: Math.max(0, Number(features[feature.key]!.dailyLimit) || 0),
        featureKey: feature.key,
      }));
    setMessage('Salvando…');
    try {
      const input = { annualPriceCents, isDefault, limits, name, priceCents };
      const saved = editingId
        ? await api.adminUpdateSubscriptionPlan(editingId, input, accessToken)
        : await api.adminCreateSubscriptionPlan(input, accessToken);
      setPlans((current) =>
        editingId
          ? current.map((plan) => (plan.id === saved.id ? saved : plan))
          : [...current, saved],
      );
      setMessage(editingId ? 'Plano atualizado.' : 'Plano criado.');
      startCreate();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar o plano.');
    }
  }

  async function toggleStatus(plan: SubscriptionPlan) {
    const accessToken = token();
    if (!accessToken) return;
    const status = plan.status === 'active' ? 'archived' : 'active';
    try {
      const updated = await api.adminUpdateSubscriptionPlanStatus(plan.id, { status }, accessToken);
      setPlans((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível atualizar o plano.');
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <span>Administração</span>
        <h1>Planos de assinatura</h1>
        <p>
          Cada plano libera um conjunto de recursos com uma quantidade diária — deixe 0 para
          ilimitado. Um recurso não marcado fica indisponível nesse plano.
        </p>
      </header>
      <p className={styles.status} role="status">
        {message}
      </p>

      {plans.length > 0 ? (
        <section className={styles.tableCard} aria-label="Planos existentes" role="table">
          <div className={styles.planTableHeader} role="row">
            <span role="columnheader">Nome</span>
            <span role="columnheader">Preço</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Recursos</span>
            <span role="columnheader">Ações</span>
          </div>
          {plans.map((plan) => (
            <div className={styles.planTableRow} key={plan.id} role="row">
              <span role="cell">{plan.name}</span>
              <span role="cell">
                {(plan.priceCents / 100).toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </span>
              <span role="cell">
                {plan.status === 'active' ? 'Ativo' : 'Arquivado'}
                {plan.isDefault ? ' · Padrão (grátis)' : ''}
              </span>
              <small role="cell">
                {plan.limits.length === 0
                  ? 'Nenhum'
                  : plan.limits
                      .map((limit) => {
                        const label =
                          planFeatureCatalog.find((feature) => feature.key === limit.featureKey)
                            ?.label ?? limit.featureKey;
                        return `${label}: ${limit.dailyLimit === 0 ? 'ilimitado' : limit.dailyLimit}`;
                      })
                      .join(' · ')}
              </small>
              <div role="cell">
                <button className="adminActionButton" onClick={() => startEdit(plan)} type="button">
                  Editar
                </button>
                <button
                  className="adminActionButton"
                  onClick={() => void toggleStatus(plan)}
                  type="button"
                >
                  {plan.status === 'active' ? 'Arquivar' : 'Reativar'}
                </button>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <form className={styles.formCard} onSubmit={save}>
        <h2>{editingId ? 'Editar plano' : 'Novo plano'}</h2>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            Nome do plano
            <input onChange={(event) => setName(event.target.value)} required value={name} />
          </label>
          <label className={styles.field}>
            Preço mensal (R$)
            <input
              min="0"
              onChange={(event) => setPriceReais(event.target.value)}
              step="0.01"
              type="number"
              value={priceReais}
            />
          </label>
          <label className={styles.field}>
            Preço anual (R$) — opcional, pagamento único sem renovação automática
            <input
              min="0"
              onChange={(event) => setAnnualPriceReais(event.target.value)}
              placeholder="Sem cobrança anual"
              step="0.01"
              type="number"
              value={annualPriceReais}
            />
          </label>
          <label className={styles.checkbox}>
            <input
              checked={isDefault}
              onChange={(event) => setIsDefault(event.target.checked)}
              type="checkbox"
            />{' '}
            Usar como plano padrão (gratuito) — aplicado a quem não tem assinatura paga
          </label>
        </div>
        <fieldset>
          <legend>Recursos disponíveis neste plano</legend>
          {planFeatureCatalog.map((feature) => (
            <div className={styles.planFeatureRow} key={feature.key}>
              <label className={styles.checkbox}>
                <input
                  checked={features[feature.key]!.included}
                  onChange={() => toggleFeature(feature.key)}
                  type="checkbox"
                />{' '}
                {feature.label}
              </label>
              {features[feature.key]!.included ? (
                <label className={styles.field}>
                  Limite diário (0 = ilimitado)
                  <input
                    min="0"
                    onChange={(event) => setFeatureLimit(feature.key, event.target.value)}
                    type="number"
                    value={features[feature.key]!.dailyLimit}
                  />
                </label>
              ) : null}
            </div>
          ))}
        </fieldset>
        <div>
          <button className={styles.primaryButton} type="submit">
            {editingId ? 'Salvar alterações' : 'Criar plano'}
          </button>
          {editingId ? (
            <button className="adminActionButton" onClick={startCreate} type="button">
              Cancelar edição
            </button>
          ) : null}
        </div>
      </form>
    </main>
  );
}
