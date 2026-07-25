'use client';

import type { AdminBotStats, AdminOnlineBot } from '@xadrez/contracts';
import { useEffect, useState } from 'react';

import { Avatar } from '@/components/ui/avatar';
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
  const [onlineBots, setOnlineBots] = useState<AdminOnlineBot[] | null>(null);
  const [onlineMessage, setOnlineMessage] = useState('');

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

  async function toggleOnlineList() {
    if (onlineBots !== null) {
      setOnlineBots(null);
      return;
    }
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    setOnlineMessage('Carregando…');
    try {
      setOnlineBots(await api.adminListOnlineBots(token));
      setOnlineMessage('');
    } catch (error) {
      setOnlineMessage(error instanceof Error ? error.message : 'Falha ao carregar bots online.');
    }
  }

  return (
    <main className="dashboardPage">
      <header className="pageHeader">
        <h1>Bots sociais</h1>
        <p>Visão geral das contas-bot que povoam amizades, presença e partidas da plataforma.</p>
      </header>
      <p role="status">{message}</p>
      {stats ? (
        <div className="adminHubGrid">
          {tiles.map((tile) =>
            tile.key === 'onlineNow' ? (
              <button
                aria-expanded={onlineBots !== null}
                className="adminHubCard adminHubCardClickable"
                key={tile.key}
                onClick={() => void toggleOnlineList()}
                type="button"
              >
                <strong>{stats[tile.key]}</strong>
                <span>{tile.label} · clique para ver quem</span>
              </button>
            ) : (
              <div className="adminHubCard" key={tile.key}>
                <strong>{stats[tile.key]}</strong>
                <span>{tile.label}</span>
              </div>
            ),
          )}
        </div>
      ) : null}
      {onlineBots !== null ? (
        <section aria-label="Bots online agora" className="cardGrid">
          <h2>Bots online agora ({onlineBots.length})</h2>
          <p role="status">{onlineMessage}</p>
          <div className="adminUserTable" role="table">
            {onlineBots.map((bot) => (
              <div className="adminUserRow" key={bot.userId} role="row">
                <div>
                  <Avatar avatarUrl={bot.avatarUrl} name={bot.displayName} />
                  <strong>{bot.displayName}</strong> <span>@{bot.username}</span>
                </div>
                <span>{bot.targetRating} XE</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
