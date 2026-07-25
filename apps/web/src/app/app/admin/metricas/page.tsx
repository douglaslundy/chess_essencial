'use client';

import type { AdminMetrics } from '@xadrez/contracts';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api/client';

const tiles: { key: keyof AdminMetrics; label: string }[] = [
  { key: 'totalUsers', label: 'Usuários ativos' },
  { key: 'newUsersLast7Days', label: 'Novos cadastros (7 dias)' },
  { key: 'gamesPlayedTotal', label: 'Partidas jogadas (total)' },
  { key: 'gamesPlayedToday', label: 'Partidas hoje' },
  { key: 'exercisesSolvedTotal', label: 'Exercícios resolvidos' },
  { key: 'lessonsCompletedTotal', label: 'Aulas concluídas' },
  { key: 'referralsTotal', label: 'Indicações registradas' },
  { key: 'referralsRewarded', label: 'Indicações recompensadas' },
];

export default function AdminMetricsPage() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [message, setMessage] = useState('Carregando métricas…');

  useEffect(() => {
    queueMicrotask(() => {
      const token = window.localStorage.getItem('xadrez.access_token');
      if (!token) {
        setMessage('Entre com uma conta de administrador.');
        return;
      }
      api
        .adminGetMetrics(token)
        .then((value) => {
          setMetrics(value);
          setMessage('');
        })
        .catch((error: unknown) =>
          setMessage(error instanceof Error ? error.message : 'Falha ao carregar métricas.'),
        );
    });
  }, []);

  return (
    <main className="dashboardPage">
      <header className="pageHeader">
        <h1>Métricas da plataforma</h1>
        <p>Visão geral de uso: usuários, partidas, exercícios, aulas, assinaturas e indicações.</p>
      </header>
      <p role="status">{message}</p>
      {metrics ? (
        <>
          <div className="adminHubGrid">
            {tiles.map((tile) => (
              <div className="adminHubCard" key={tile.key}>
                <strong>{metrics[tile.key] as number}</strong>
                <span>{tile.label}</span>
              </div>
            ))}
          </div>
          <section className="adminHubCard" aria-label="Assinaturas ativas por plano">
            <h2>Assinaturas ativas por plano</h2>
            {metrics.activeSubscriptionsByPlan.length === 0 ? (
              <p>Nenhuma assinatura ativa no momento.</p>
            ) : (
              <ul>
                {metrics.activeSubscriptionsByPlan.map((entry) => (
                  <li key={entry.planName}>
                    {entry.planName}: {entry.count}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
