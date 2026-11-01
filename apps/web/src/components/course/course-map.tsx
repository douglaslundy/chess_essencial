'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { COURSE_MODULES } from './course-content';
import styles from './course.module.css';
import { api } from '@/lib/api/client';

const LEVELS = ['Regras', 'Iniciante', 'Básico', 'Intermediário', 'Avançado'];

// shortcut: plain list with the ✓ of finished activities; CURSO-03 adds levels map and locks.
export function CourseMap() {
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  useEffect(() => {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    api
      .getCourseTrailProgress(token)
      .then((progress) => setCompleted(new Set(progress.completedActivityIds)))
      .catch(() => undefined);
  }, []);

  return (
    <main className={styles.page}>
      <h1>Curso do zero ao avançado</h1>
      <p>O Treinador explica, você faz no tabuleiro e a setinha leva ao próximo passo.</p>
      {COURSE_MODULES.map((module) => (
        <section className={styles.module} key={module.id}>
          <h2>
            <small>
              Nível {module.level}: {LEVELS[module.level]}
            </small>
            {module.title}
          </h2>
          <ol>
            {module.activities.map((activity) => (
              <li key={activity.id}>
                <Link
                  data-done={completed.has(activity.id) || undefined}
                  href={`/app/curso/${activity.id}`}
                >
                  <span>{activity.title}</span>
                  <small>
                    {completed.has(activity.id) ? '✓ Concluída' : `${activity.steps.length} passos`}
                  </small>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </main>
  );
}
