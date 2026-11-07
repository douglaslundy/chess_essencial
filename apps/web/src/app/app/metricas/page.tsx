'use client';

import type { PlayerMetrics, RatingHistoryEntry, RatingProfile } from '@xadrez/contracts';
import { useEffect, useState } from 'react';

import { RatingChart } from '@/components/metrics/rating-chart';
import { api } from '@/lib/api/client';

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<PlayerMetrics | null>(null);
  const [profiles, setProfiles] = useState<RatingProfile[]>([]);
  const [history, setHistory] = useState<RatingHistoryEntry[]>([]);
  const [pool, setPool] = useState<string | null>(null);
  const [message, setMessage] = useState('Carregando suas métricas…');

  useEffect(() => {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) {
      queueMicrotask(() => setMessage('Entre na sua conta para ver as métricas.'));
      return;
    }
    Promise.all([api.getMyMetrics(token), api.getRatings(token), api.getMyRatingHistory(token)])
      .then(([nextMetrics, nextProfiles, nextHistory]) => {
        setMetrics(nextMetrics);
        setProfiles(nextProfiles);
        setHistory(nextHistory);
        // Starts on the pool with the most rated games.
        const best = [...nextProfiles].sort((a, b) => b.gamesCount - a.gamesCount)[0];
        setPool(best?.pool ?? null);
        setMessage('');
      })
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error ? error.message : 'Não foi possível carregar as métricas.',
        ),
      );
  }, []);

  if (!metrics) {
    return (
      <main className="dashboardPage">
        <h1>Métricas</h1>
        <p role="status">{message}</p>
      </main>
    );
  }

  const profile = profiles.find((item) => item.pool === pool) ?? null;
  const points = history
    .filter((entry) => entry.pool === pool)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((entry) => ({ date: entry.createdAt, rating: entry.ratingAfter }));
  const quality = metrics.quality;

  return (
    <main className="dashboardPage metricsPage">
      <header className="pageHeader">
        <h1>Métricas</h1>
        <p>Seu desempenho como jogador de xadrez.</p>
      </header>

      <section aria-label="Resumo geral" className="metricsBlock">
        <h2>Resumo geral</h2>
        <p>{metrics.summary}</p>
      </section>

      <section aria-label="Números" className="metricsCards">
        <article>
          <span>Partidas</span>
          <strong>{metrics.gamesPlayed}</strong>
          <small>
            {metrics.wins} V · {metrics.draws} E · {metrics.losses} D
          </small>
        </article>
        <article>
          <span>Tempo jogado</span>
          <strong>{formatDuration(metrics.timePlayedSeconds)}</strong>
        </article>
        <article>
          <span>Rating {pool ? `(${pool})` : ''}</span>
          <strong>{profile ? profile.rating : '—'}</strong>
          <small>{profile ? `pico ${profile.peakRating}` : 'sem partidas valendo rating'}</small>
        </article>
        <article>
          <span>Lances ótimos ou excelentes</span>
          <strong>{quality.otimo + quality.excelente}</strong>
          <small>
            {quality.gafe} gafes · {quality.erro} erros
          </small>
        </article>
      </section>

      <section aria-label="Evolução do rating" className="metricsBlock">
        <h2>Evolução do rating</h2>
        {profiles.length > 1 ? (
          <label>
            Ritmo:{' '}
            <select onChange={(event) => setPool(event.target.value)} value={pool ?? ''}>
              {profiles.map((item) => (
                <option key={item.pool} value={item.pool}>
                  {item.pool}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <RatingChart points={points} />
      </section>

      <div className="metricsColumns">
        <section aria-label="Pontos fortes" className="metricsBlock metricsStrong">
          <h2>Pontos fortes</h2>
          {metrics.strengths.length > 0 ? (
            <ul>
              {metrics.strengths.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p>Ainda não há dados suficientes. Jogue e revise mais partidas.</p>
          )}
        </section>
        <section aria-label="Pontos fracos" className="metricsBlock metricsWeak">
          <h2>Pontos fracos</h2>
          {metrics.weaknesses.length > 0 ? (
            <ul>
              {metrics.weaknesses.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p>Nenhuma dificuldade clara nas últimas partidas analisadas.</p>
          )}
        </section>
      </div>
    </main>
  );
}
