'use client';

import type { LibraryFacets, LibraryGameSummary } from '@xadrez/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { formatPlayedOn } from './format-date';
import styles from './library.module.css';
import { readWatchedGames } from './watched-games';
import { api } from '@/lib/api/client';

const PAGE_SIZE = 20;
const RESULT_LABEL: Record<string, string> = {
  '1-0': 'Brancas venceram',
  '0-1': 'Pretas venceram',
  '1/2-1/2': 'Empate',
};

interface Filters {
  opening: string;
  player: string;
  q: string;
  result: string;
  yearFrom: string;
  yearTo: string;
}

const EMPTY: Filters = { opening: '', player: '', q: '', result: '', yearFrom: '', yearTo: '' };

function toQuery(filters: Filters, offset: number) {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  return params;
}

export function LibraryBrowser() {
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<LibraryGameSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<LibraryFacets | null>(null);
  const [status, setStatus] = useState('Carregando partidas…');
  const [watched, setWatched] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    queueMicrotask(() => setWatched(readWatchedGames()));
  }, []);

  useEffect(() => {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    api
      .getLibraryFacets(token)
      .then(setFacets)
      .catch(() => undefined);
  }, []);

  const load = useCallback(async (filters: Filters, nextOffset: number) => {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) {
      setStatus('Entre na sua conta para estudar partidas.');
      return;
    }
    setStatus('Carregando partidas…');
    try {
      const result = await api.searchLibraryGames(toQuery(filters, nextOffset), token);
      setItems(result.items);
      setTotal(result.total);
      setStatus(result.total === 0 ? 'Nenhuma partida encontrada com esses filtros.' : '');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Falha ao carregar a biblioteca.');
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load(applied, offset));
  }, [applied, offset, load]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setOffset(0);
    setApplied(draft);
  }

  function clear() {
    setDraft(EMPTY);
    setOffset(0);
    setApplied(EMPTY);
  }

  const set = (key: keyof Filters) => (value: string) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <span>Biblioteca</span>
        <h1>Estude partidas de grandes mestres</h1>
        <p>Filtre por jogador, abertura ou resultado e revise lance a lance, com narração.</p>
      </header>
      <form className={styles.filters} onSubmit={submit}>
        <label>
          Jogador
          <input
            list="library-players"
            onChange={(e) => set('player')(e.target.value)}
            placeholder="Ex.: Fischer"
            value={draft.player}
          />
          <datalist id="library-players">
            {facets?.players.map((p) => (
              <option key={p.name} value={p.name} />
            ))}
          </datalist>
        </label>
        <label>
          Abertura
          <select onChange={(e) => set('opening')(e.target.value)} value={draft.opening}>
            <option value="">Todas</option>
            {facets?.openings.map((o) => (
              <option key={o.name} value={o.name}>
                {o.name} ({o.count})
              </option>
            ))}
          </select>
        </label>
        <label>
          Resultado
          <select onChange={(e) => set('result')(e.target.value)} value={draft.result}>
            <option value="">Todos</option>
            <option value="1-0">Brancas venceram</option>
            <option value="0-1">Pretas venceram</option>
            <option value="1/2-1/2">Empate</option>
          </select>
        </label>
        <label>
          Ano de
          <input
            inputMode="numeric"
            onChange={(e) => set('yearFrom')(e.target.value.replace(/\D/g, '').slice(0, 4))}
            value={draft.yearFrom}
          />
        </label>
        <label>
          Ano até
          <input
            inputMode="numeric"
            onChange={(e) => set('yearTo')(e.target.value.replace(/\D/g, '').slice(0, 4))}
            value={draft.yearTo}
          />
        </label>
        <label>
          Busca livre
          <input
            onChange={(e) => set('q')(e.target.value)}
            placeholder="Evento, jogador…"
            value={draft.q}
          />
        </label>
        <div className={styles.filterActions}>
          <button className={`${styles.button} ${styles.primary}`} type="submit">
            Filtrar
          </button>
          <button className={styles.button} onClick={clear} type="button">
            Limpar
          </button>
        </div>
      </form>
      <p aria-live="polite" className={styles.status}>
        {status || `${total.toLocaleString('pt-BR')} partidas`}
      </p>
      <ul className={styles.list}>
        {items.map((game) => (
          <li key={game.id}>
            <Link
              className={watched.has(game.id) ? `${styles.card} ${styles.watched}` : styles.card}
              href={`/app/biblioteca/${game.id}`}
            >
              <strong>
                {game.white} × {game.black}
                {watched.has(game.id) ? (
                  <span className={styles.watchedBadge}>✓ Assistida</span>
                ) : null}
              </strong>
              <span className={styles.meta}>
                <span>{RESULT_LABEL[game.result]}</span>
                {game.event ? <span>{game.event}</span> : null}
                {game.playedOn ? <span>{formatPlayedOn(game.playedOn)}</span> : null}
                {game.openingName ? <span>{game.openingName}</span> : null}
                {game.eco ? <span>ECO {game.eco}</span> : null}
                <span>{Math.ceil(game.plyCount / 2)} lances</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <nav aria-label="Paginação" className={styles.pager}>
        <button
          className={styles.button}
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          type="button"
        >
          Anterior
        </button>
        <span className={styles.status}>
          Página {Math.floor(offset / PAGE_SIZE) + 1} de {Math.max(1, Math.ceil(total / PAGE_SIZE))}
        </span>
        <button
          className={styles.button}
          disabled={offset + PAGE_SIZE >= total}
          onClick={() => setOffset(offset + PAGE_SIZE)}
          type="button"
        >
          Próxima
        </button>
      </nav>
    </main>
  );
}
