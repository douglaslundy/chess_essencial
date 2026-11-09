'use client';

import type { AdminOpeningLesson, OpeningDetail } from '@xadrez/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import styles from '@/components/portal/portal-pages.module.css';
import { api } from '@/lib/api/client';

const token = () => window.localStorage.getItem('xadrez.access_token') ?? '';

type Filter = 'all' | 'pending' | 'reviewed';

export default function AdminOpeningsPage() {
  const [filter, setFilter] = useState<Filter>('pending');
  const [lessons, setLessons] = useState<AdminOpeningLesson[]>([]);
  const [editing, setEditing] = useState<OpeningDetail | null>(null);
  const [overview, setOverview] = useState('');
  const [frames, setFrames] = useState<Array<{ index: number; label: string; text: string }>>([]);
  const [family, setFamily] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(() => {
    const reviewed = filter === 'all' ? undefined : filter === 'reviewed';
    api
      .adminListOpeningLessons(reviewed, token())
      .then(setLessons)
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : 'Falha ao carregar as aulas.'),
      );
  }, [filter]);

  useEffect(load, [load]);

  async function open(openingId: string) {
    try {
      const detail = await api.getOpening(openingId, token());
      setEditing(detail);
      setOverview(detail.lesson.overview);
      setFrames(detail.lesson.frames);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao abrir a aula.');
    }
  }

  async function save(reviewed: boolean) {
    if (!editing) return;
    try {
      await api.adminSaveOpeningLesson(editing.line.id, { frames, overview, reviewed }, token());
      setMessage(reviewed ? 'Aula salva e marcada como revisada.' : 'Aula salva.');
      setEditing(null);
      load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao salvar a aula.');
    }
  }

  async function pregenerate() {
    if (!family.trim()) return;
    try {
      const { started } = await api.adminPregenerateOpeningLessons(family.trim(), token());
      setMessage(
        `${started} aula(s) sendo geradas em segundo plano. Atualize a lista em alguns minutos.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao iniciar a geração.');
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <span>Administração</span>
        <h1>Aberturas: revisão das aulas</h1>
        <p>
          A IA escreve cada aula uma vez e ela fica guardada. Aqui você corrige o texto e marca como
          revisada: uma aula revisada nunca é reescrita pela IA.
        </p>
      </header>

      <section className={styles.card}>
        <h2>Gerar antes as aulas de uma família</h2>
        <label className={styles.field}>
          Nome da família (ex.: Sicilian Defense)
          <input onChange={(event) => setFamily(event.target.value)} value={family} />
        </label>
        <button className={styles.primaryButton} onClick={() => void pregenerate()} type="button">
          Gerar as que faltam (até 40)
        </button>
      </section>

      <section className={styles.card}>
        <div role="group" aria-label="Filtro">
          {(['pending', 'reviewed', 'all'] as const).map((item) => (
            <button
              aria-pressed={filter === item}
              key={item}
              onClick={() => setFilter(item)}
              type="button"
            >
              {item === 'pending' ? 'A revisar' : item === 'reviewed' ? 'Revisadas' : 'Todas'}
            </button>
          ))}
        </div>
        <ul>
          {lessons.map((lesson) => (
            <li key={lesson.openingId}>
              <button onClick={() => void open(lesson.openingId)} type="button">
                {lesson.eco} · {lesson.name}
              </button>{' '}
              {lesson.reviewed ? '✔' : lesson.status === 'completed' ? '' : `(${lesson.status})`}{' '}
              <Link href={`/app/aberturas/${lesson.openingId}`}>ver</Link>
            </li>
          ))}
        </ul>
      </section>

      {editing ? (
        <section className={styles.card}>
          <h2>{editing.line.name}</h2>
          <p className={styles.helpText}>{editing.line.pgn}</p>
          <label className={styles.field}>
            Visão geral
            <textarea
              onChange={(event) => setOverview(event.target.value)}
              rows={5}
              value={overview}
            />
          </label>
          {frames.map((frame, position) => (
            <label className={styles.field} key={frame.index}>
              {frame.label}
              <textarea
                onChange={(event) =>
                  setFrames((current) =>
                    current.map((item, i) =>
                      i === position ? { ...item, text: event.target.value } : item,
                    ),
                  )
                }
                rows={2}
                value={frame.text}
              />
            </label>
          ))}
          <button className={styles.primaryButton} onClick={() => void save(true)} type="button">
            Salvar e marcar como revisada
          </button>{' '}
          <button onClick={() => void save(false)} type="button">
            Salvar sem marcar
          </button>{' '}
          <button onClick={() => setEditing(null)} type="button">
            Cancelar
          </button>
        </section>
      ) : null}

      {message ? (
        <p className={styles.status} role="status">
          {message}
        </p>
      ) : null}
    </main>
  );
}
