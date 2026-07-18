'use client';

import type { LeaderboardEntry, RatingPool } from '@xadrez/contracts';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api/client';
import styles from '@/components/portal/portal-pages.module.css';

const pools: Array<{ label: string; value: RatingPool }> = [
  { label: 'Bullet', value: 'bullet' },
  { label: 'Blitz', value: 'blitz' },
  { label: 'Rápida', value: 'rapid' },
  { label: 'Clássica', value: 'classical' },
  { label: 'Correspondência', value: 'correspondence' },
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
            <span>
              {entry.displayName}
              <small>@{entry.username}</small>
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
