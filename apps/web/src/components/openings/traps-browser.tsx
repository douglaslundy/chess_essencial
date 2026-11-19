'use client';

import type { OpeningLine } from '@xadrez/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import styles from '@/components/library/library.module.css';
import { readWatchedGames } from '@/components/library/watched-games';
import { api } from '@/lib/api/client';

const token = () => window.localStorage.getItem('xadrez.access_token') ?? '';

export function TrapsBrowser() {
  const [side, setSide] = useState<'black' | 'white'>('white');
  const [traps, setTraps] = useState<OpeningLine[] | null>(null);
  const [due, setDue] = useState<OpeningLine[]>([]);
  const [query, setQuery] = useState('');
  const [watched, setWatched] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    queueMicrotask(() => setWatched(readWatchedGames()));
  }, []);
  const [status, setStatus] = useState('Carregando as armadilhas…');

  useEffect(() => {
    api
      .listDueOpenings(token(), 'trap')
      .then(setDue)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = setTimeout(
      () => {
        api
          .searchOpenings({ kind: 'trap', q: query.trim() || undefined }, token())
          .then((items) => {
            setTraps(items);
            setStatus('');
          })
          .catch((error: unknown) =>
            setStatus(error instanceof Error ? error.message : 'Falha ao carregar as armadilhas.'),
          );
      },
      query ? 250 : 0,
    );
    return () => clearTimeout(timer);
  }, [query]);

  const shown = (traps ?? []).filter((trap) => trap.side === side);

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <span>Estudo</span>
        <h1>Armadilhas</h1>
        <p>
          Armadilhas clássicas de abertura. Escolha o lado que arma a armadilha: você estuda cada
          lance, treina de memória e joga contra o bot, que cai nela.
        </p>
      </header>

      {due.length > 0 ? (
        <section className={styles.filters} aria-label="Para repetir hoje">
          <strong>Para repetir hoje</strong>
          {due.map((line) => (
            <Link href={`/app/aberturas/${line.id}?modo=treino`} key={line.id}>
              {line.name}
            </Link>
          ))}
        </section>
      ) : null}

      <div className={styles.filters}>
        <div role="group" aria-label="Lado que arma a armadilha">
          <button
            aria-pressed={side === 'white'}
            className={side === 'white' ? `${styles.button} ${styles.primary}` : styles.button}
            onClick={() => setSide('white')}
            type="button"
          >
            Com as brancas
          </button>{' '}
          <button
            aria-pressed={side === 'black'}
            className={side === 'black' ? `${styles.button} ${styles.primary}` : styles.button}
            onClick={() => setSide('black')}
            type="button"
          >
            Com as pretas
          </button>
        </div>
        <label>
          Buscar uma armadilha pelo nome
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ex.: Légal"
            value={query}
          />
        </label>
      </div>

      <p aria-live="polite" className={styles.status}>
        {status || (shown.length === 0 ? 'Nenhuma armadilha encontrada para este lado.' : '')}
      </p>

      <ul className={styles.list}>
        {shown.map((trap) => (
          <li
            className={watched.has(trap.id) ? `${styles.card} ${styles.watched}` : styles.card}
            key={trap.id}
          >
            {trap.trapRank ? <span className={styles.meta}>#{trap.trapRank} </span> : null}
            <Link href={`/app/aberturas/${trap.id}`}>
              <strong>{trap.name}</strong>
            </Link>
            <span className={styles.meta}> ({Math.ceil(trap.plyCount / 2)} lances)</span>
            {watched.has(trap.id) ? <span className={styles.watchedBadge}>✓ Assistida</span> : null}
            <span className={styles.meta}>{trap.trapIdea}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
