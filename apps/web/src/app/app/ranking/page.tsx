'use client';

import type { LeaderboardEntry, RatingPool } from '@xadrez/contracts';
import { useEffect, useState } from 'react';

import { Avatar } from '@/components/ui/avatar';
import { api } from '@/lib/api/client';
import styles from '@/components/portal/portal-pages.module.css';

const pools: Array<{ description: string; label: string; value: RatingPool }> = [
  {
    description: 'Partidas ultrarrápidas, normalmente de 1 a 2 minutos.',
    label: 'Bullet',
    value: 'bullet',
  },
  {
    description: 'Partidas muito rápidas, normalmente de 3 a 5 minutos.',
    label: 'Blitz',
    value: 'blitz',
  },
  {
    description: 'Partidas de 10 a 15 minutos, com mais tempo para pensar.',
    label: 'Rápida',
    value: 'rapid',
  },
  {
    description: 'Partidas longas, a partir de 30 minutos.',
    label: 'Clássica',
    value: 'classical',
  },
  {
    description: 'Partidas assíncronas, com bastante tempo para cada lance.',
    label: 'Correspondência',
    value: 'correspondence',
  },
];

export default function RankingPage() {
  const [pool, setPool] = useState<RatingPool>('rapid');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [message, setMessage] = useState('Carregando ranking…');

  useEffect(() => {
    queueMicrotask(() => {
      const token = window.localStorage.getItem('xadrez.access_token');
      if (!token) {
        setMessage('Entre na sua conta para visualizar o ranking.');
        return;
      }
      setMessage('Carregando ranking…');
      api
        .getLeaderboard(pool, token)
        .then((value) => {
          setEntries(value);
          setMessage(value.length ? '' : 'Ainda não há jogadores classificados neste ritmo.');
        })
        .catch((error: unknown) =>
          setMessage(
            error instanceof Error ? error.message : 'Não foi possível carregar o ranking.',
          ),
        );
    });
  }, [pool]);

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <span>Classificação Xadrez Essencial</span>
        <h1>Ranking por ritmo</h1>
        <p>O rating da plataforma é independente e separado por controle de tempo.</p>
      </header>
      <label className={styles.field}>
        Ritmo
        <select onChange={(event) => setPool(event.target.value as RatingPool)} value={pool}>
          {pools.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <small className={styles.helpText}>
        {pools.find((item) => item.value === pool)!.description}
      </small>
      <p className={styles.status} role="status">
        {message}
      </p>
      <section className={styles.tableCard} aria-label="Ranking de jogadores">
        <div className={styles.tableHeader}>
          <span>Posição</span>
          <span>Jogador</span>
          <span>Rating</span>
          <span>Partidas</span>
        </div>
        {entries.map((entry) => (
          <div className={styles.tableRow} key={entry.userId}>
            <strong>#{entry.rank}</strong>
            <span className={styles.playerCell}>
              <Avatar avatarUrl={entry.avatarUrl} name={entry.displayName} />
              <span>
                {entry.displayName}
                <small>@{entry.username}</small>
              </span>
            </span>
            <strong>{entry.rating}</strong>
            <span>
              {entry.gamesCount}
              {entry.provisional ? ' · provisório' : ''}
            </span>
          </div>
        ))}
      </section>
    </main>
  );
}
