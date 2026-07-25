'use client';

import type { ReferralSettings, SubscriptionPlan } from '@xadrez/contracts';
import { useEffect, useState, type FormEvent } from 'react';

import { api } from '@/lib/api/client';
import styles from '@/components/portal/portal-pages.module.css';

export default function AdminReferralSettingsPage() {
  const [settings, setSettings] = useState<ReferralSettings | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [message, setMessage] = useState('Carregando configuração…');

  useEffect(() => {
    queueMicrotask(() => {
      const token = window.localStorage.getItem('xadrez.access_token');
      if (!token) {
        setMessage('Entre com uma conta de administrador.');
        return;
      }
      Promise.all([api.adminGetReferralSettings(token), api.adminListSubscriptionPlans(token)])
        .then(([settingsResult, plansResult]) => {
          setSettings(settingsResult);
          setPlans(plansResult.items);
          setMessage('');
        })
        .catch((error: unknown) =>
          setMessage(error instanceof Error ? error.message : 'Falha ao carregar configuração.'),
        );
    });
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    const data = new FormData(event.currentTarget);
    const rewardPlanId = String(data.get('rewardPlanId') ?? '').trim() || null;
    setMessage('Salvando…');
    try {
      const updated = await api.adminUpdateReferralSettings(
        { rewardDays: Number(data.get('rewardDays')), rewardPlanId },
        token,
      );
      setSettings(updated);
      setMessage('Configuração de indicações salva com sucesso.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Não foi possível salvar a configuração.',
      );
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <span>Administração</span>
        <h1>Programa de indicação</h1>
        <p>
          Quando configurado, quem indicar um amigo ganha acesso temporário ao plano escolhido assim
          que o amigo confirmar o e-mail. Deixe sem plano selecionado para só acompanhar as
          indicações, sem conceder nada automaticamente.
        </p>
      </header>
      <p className={styles.status} role="status">
        {message}
      </p>
      {settings ? (
        <form className={styles.formCard} onSubmit={save}>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              Plano de recompensa
              <select defaultValue={settings.rewardPlanId ?? ''} name="rewardPlanId">
                <option value="">Nenhum (só acompanhar)</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Dias de acesso concedidos
              <input defaultValue={settings.rewardDays} min="0" name="rewardDays" type="number" />
            </label>
          </div>
          <button className={styles.primaryButton} type="submit">
            Salvar configuração
          </button>
        </form>
      ) : null}
    </main>
  );
}
