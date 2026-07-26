'use client';

import type { GameHistoryPage } from '@xadrez/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { reviewEligibility } from './review-eligibility';
import { Avatar } from '@/components/ui/avatar';
import { api } from '@/lib/api/client';

function formatGameDate(isoDate: string | null) {
  if (!isoDate) return null;
  return new Date(isoDate).toLocaleString('pt-BR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function HistoryList() {
  const [history, setHistory] = useState<GameHistoryPage>({
    items: [],
    limit: 20,
    page: 1,
    total: 0,
  });
  const [page, setPage] = useState(1);
  const [pool, setPool] = useState('');
  const [result, setResult] = useState('');
  const [message, setMessage] = useState('Carregando partidas…');

  const load = useCallback(() => {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) {
      setMessage('Entre na sua conta para consultar o histórico.');
      return;
    }
    const query = new URLSearchParams({ limit: '20', page: String(page), status: 'finished' });
    if (pool) query.set('pool', pool);
    if (result) query.set('result', result);
    api
      .getHistory(query, token)
      .then((value) => {
        setHistory(value);
        setMessage(value.items.length ? '' : 'Nenhuma partida encontrada.');
      })
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : 'Falha ao carregar.'),
      );
  }, [page, pool, result]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  const pages = Math.max(1, Math.ceil(history.total / history.limit));
  return (
    <main className="historyPage">
      <header className="pageHeading">
        <span className="eyebrow">Arquivo pessoal</span>
        <h1>Histórico de partidas</h1>
        <p>Filtre seus jogos concluídos e abra a revisão lance a lance.</p>
      </header>
      <section className="historyFilters" aria-label="Filtros do histórico">
        <label>
          Ritmo
          <select
            value={pool}
            onChange={(event) => {
              setPage(1);
              setPool(event.target.value);
            }}
          >
            <option value="">Todos</option>
            <option value="bullet">Bullet</option>
            <option value="blitz">Blitz</option>
            <option value="rapid">Rápida</option>
            <option value="classical">Clássica</option>
          </select>
        </label>
        <label>
          Resultado
          <select
            value={result}
            onChange={(event) => {
              setPage(1);
              setResult(event.target.value);
            }}
          >
            <option value="">Todos</option>
            <option value="white_win">Vitória das brancas</option>
            <option value="black_win">Vitória das pretas</option>
            <option value="draw">Empate</option>
          </select>
        </label>
      </section>
      {message ? (
        <p className="historyMessage" role="status">
          {message}
        </p>
      ) : null}
      <section className="historyGrid" aria-label="Partidas">
        {history.items.map((game) => {
          const review = reviewEligibility(game);
          return (
            <article className="historyCard" key={game.id}>
              <div className="historyCardHeader">
                <div className="historyCardTitle">
                  <Avatar avatarUrl={game.opponent.avatarUrl} name={game.opponent.displayName} />
                  <strong>{game.opponent.displayName}</strong>
                  {game.coachMode ? <span className="adminBadge">Treinador</span> : null}
                </div>
                <span className="historyCardSubtitle">
                  @{game.opponent.username} · {game.opponent.rating} XE
                </span>
              </div>
              <dl className="historyCardMeta">
                <div>
                  <dt>Ritmo</dt>
                  <dd>{game.timeControl}</dd>
                </div>
                <div>
                  <dt>Resultado</dt>
                  <dd>
                    {game.result === 'draw'
                      ? 'Empate'
                      : game.result === game.color + '_win'
                        ? 'Vitória'
                        : 'Derrota'}
                  </dd>
                </div>
                {formatGameDate(game.finishedAt ?? game.startedAt) ? (
                  <div>
                    <dt>Data</dt>
                    <dd>{formatGameDate(game.finishedAt ?? game.startedAt)}</dd>
                  </div>
                ) : null}
              </dl>
              <div className="historyCardAction">
                {review.available ? (
                  <Link href={'/app/partidas/' + game.id + '/revisao'}>Revisar partida</Link>
                ) : (
                  <span className="historyReviewUnavailable">{review.shortLabel}</span>
                )}
              </div>
            </article>
          );
        })}
      </section>
      <nav className="pagination" aria-label="Paginação">
        <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} type="button">
          Anterior
        </button>
        <span>
          Página {page} de {pages}
        </span>
        <button
          disabled={page >= pages}
          onClick={() => setPage((value) => value + 1)}
          type="button"
        >
          Próxima
        </button>
      </nav>
    </main>
  );
}
