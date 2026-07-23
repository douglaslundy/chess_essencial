'use client';

import type { AdminBotStats } from '@xadrez/contracts';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api/client';

const tiles: { key: keyof AdminBotStats; label: string }[] = [
  { key: 'total', label: 'Bots sociais' },
  { key: 'onlineNow', label: 'Online agora' },
  { key: 'friendshipsCount', label: 'Amizades com bots' },
  { key: 'gamesPlayed', label: 'Partidas jogadas por bots' },
];

export default function AdminBotsPage() {
  const [stats, setStats] = useState<AdminBotStats | null>(null);
  const [message, setMessage] = useState('Carregando estatísticas…');

  useEffect(() => {
    queueMicrotask(() => {
      const token = window.localStorage.getItem('xadrez.access_token');
      if (!token) {
        setMessage('Entre com uma conta de administrador.');
        return;
      }
      api
        .adminGetBotStats(token)
        .then((value) => {
          setStats(value);
          setMessage('');
        })
        .catch((error: unknown) =>
          setMessage(error instanceof Error ? error.message : 'Falha ao carregar estatísticas.'),
        );
    });
  }, []);

  return (
    <main className="dashboardPage">
      <header className="pageHeader">
        <h1>Bots sociais</h1>
        <p>Visão geral das contas-bot que povoam amizades, presença e partidas da plataforma.</p>
      </header>
      <p role="status">{message}</p>
      {stats ? (
        <div className="adminHubGrid">
          {tiles.map((tile) => (
            <div className="adminHubCard" key={tile.key}>
              <strong>{stats[tile.key]}</strong>
              <span>{tile.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </main>
  );
}
