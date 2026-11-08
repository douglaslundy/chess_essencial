'use client';

import type { OpeningFamily, OpeningLine } from '@xadrez/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import styles from '@/components/portal/portal-pages.module.css';
import { api } from '@/lib/api/client';

const token = () => window.localStorage.getItem('xadrez.access_token') ?? '';

export function OpeningsBrowser() {
  const [side, setSide] = useState<'black' | 'white'>('white');
  const [families, setFamilies] = useState<OpeningFamily[]>([]);
  const [family, setFamily] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [lines, setLines] = useState<OpeningLine[]>([]);
  const [due, setDue] = useState<OpeningLine[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api
      .listDueOpenings(token())
      .then(setDue)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    api
      .listOpeningFamilies(side, token())
      .then(setFamilies)
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : 'Falha ao carregar as aberturas.'),
      );
  }, [side]);

  useEffect(() => {
    if (!family && !query.trim()) {
      queueMicrotask(() => setLines([]));
      return;
    }
    const timer = setTimeout(() => {
      api
        .searchOpenings({ family: family ?? undefined, q: query.trim() || undefined }, token())
        .then(setLines)
        .catch(() => setLines([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [family, query]);

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <span>Estudo</span>
        <h1>Aberturas</h1>
        <p>
          Escolha uma abertura, estude cada lance com a explicação do porquê e depois treine de
          memória. Os treinos voltam na hora certa para fixar o que você aprendeu.
        </p>
      </header>

      {due.length > 0 ? (
        <section className={styles.card}>
          <h2>Para repetir hoje</h2>
          <ul>
            {due.map((line) => (
              <li key={line.id}>
                <Link href={`/app/aberturas/${line.id}?modo=treino`}>{line.name}</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={styles.card}>
        <div role="group" aria-label="Lado">
          <button
            aria-pressed={side === 'white'}
            className={styles.primaryButton}
            onClick={() => {
              setSide('white');
              setFamily(null);
            }}
            type="button"
          >
            Brancas
          </button>{' '}
          <button
            aria-pressed={side === 'black'}
            className={styles.primaryButton}
            onClick={() => {
              setSide('black');
              setFamily(null);
            }}
            type="button"
          >
            Pretas
          </button>
        </div>
        <label className={styles.field}>
          Buscar pelo nome
          <input onChange={(event) => setQuery(event.target.value)} value={query} />
        </label>
        {message ? <p role="status">{message}</p> : null}
        <ul>
          {families.map((item) => (
            <li key={item.family}>
              <button onClick={() => setFamily(item.family)} type="button">
                {item.family} ({item.lines})
              </button>
            </li>
          ))}
        </ul>
      </section>

      {lines.length > 0 ? (
        <section className={styles.card}>
          <h2>{family ?? 'Resultados'}</h2>
          <ul>
            {lines.map((line) => (
              <li key={line.id}>
                <Link href={`/app/aberturas/${line.id}`}>
                  {line.eco} · {line.name}
                </Link>{' '}
                <small>{line.pgn}</small>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
