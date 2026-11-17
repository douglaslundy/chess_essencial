'use client';

import type { OpeningFamily, OpeningLine } from '@xadrez/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import styles from '@/components/library/library.module.css';
import { readWatchedGames } from '@/components/library/watched-games';
import { api } from '@/lib/api/client';

const token = () => window.localStorage.getItem('xadrez.access_token') ?? '';

export function OpeningsBrowser() {
  const [side, setSide] = useState<'black' | 'white'>('white');
  const [families, setFamilies] = useState<OpeningFamily[]>([]);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<OpeningLine[]>([]);
  const [due, setDue] = useState<OpeningLine[]>([]);
  const [watched, setWatched] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    queueMicrotask(() => setWatched(readWatchedGames()));
  }, []);
  const [status, setStatus] = useState('Carregando as aberturas…');

  useEffect(() => {
    api
      .listDueOpenings(token())
      .then(setDue)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    api
      .listOpeningFamilies(side, token())
      .then((items) => {
        setFamilies(items);
        setStatus('');
      })
      .catch((error: unknown) =>
        setStatus(error instanceof Error ? error.message : 'Falha ao carregar as aberturas.'),
      );
  }, [side]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      queueMicrotask(() => setFound([]));
      return;
    }
    const timer = setTimeout(() => {
      api
        .searchOpenings({ q: text }, token())
        .then(setFound)
        .catch(() => setFound([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <span>Estudo</span>
        <h1>Aberturas</h1>
        <p>
          Escolha uma abertura e entre nela: você estuda cada lance, treina de memória e joga contra
          o bot. As mais jogadas aparecem primeiro.
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
        <div role="group" aria-label="Lado">
          <button
            aria-pressed={side === 'white'}
            className={side === 'white' ? `${styles.button} ${styles.primary}` : styles.button}
            onClick={() => setSide('white')}
            type="button"
          >
            Brancas
          </button>{' '}
          <button
            aria-pressed={side === 'black'}
            className={side === 'black' ? `${styles.button} ${styles.primary}` : styles.button}
            onClick={() => setSide('black')}
            type="button"
          >
            Pretas
          </button>
        </div>
        <label>
          Buscar uma variação pelo nome
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ex.: Najdorf"
            value={query}
          />
        </label>
      </div>

      <p aria-live="polite" className={styles.status}>
        {status}
      </p>

      {found.length > 0 ? (
        <ul className={styles.list}>
          {found.map((line) => (
            <li
              className={watched.has(line.id) ? `${styles.card} ${styles.watched}` : styles.card}
              key={line.id}
            >
              <Link href={`/app/aberturas/${line.id}`}>
                <strong>{line.name}</strong>
              </Link>
              {watched.has(line.id) ? (
                <span className={styles.watchedBadge}>✓ Assistida</span>
              ) : null}
              <span className={styles.meta}>
                {line.eco} · {line.pgn}
                {line.games ? ` · ${line.games.toLocaleString('pt-BR')} partidas` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className={styles.list}>
          {families.map((family, position) => (
            <li className={styles.card} key={family.family}>
              <Link href={`/app/aberturas/${family.startId}`}>
                <strong>
                  {position + 1}. {family.family}
                </strong>
              </Link>
              <span className={styles.meta}>
                {family.games.toLocaleString('pt-BR')} partidas · {family.lines} variações
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
