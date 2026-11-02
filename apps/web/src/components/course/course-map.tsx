'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { COURSE_MODULES, isUnlocked } from './course-content';
import type { CourseModule } from './course-types';
import styles from './course.module.css';
import { api } from '@/lib/api/client';

const LEVELS = ['Regras', 'Iniciante', 'Básico', 'Intermediário', 'Avançado'];

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
      {LEVELS.map((name, level) => {
        const modules = COURSE_MODULES.filter((module) => module.level === level);
        const activities = modules.flatMap((module) => module.activities);
        const done = activities.filter((activity) => completed.has(activity.id)).length;
        return (
          <section aria-labelledby={`level-${level}`} className={styles.level} key={name}>
            <h2 id={`level-${level}`}>
              Nível {level}: {name}
              <small data-done={(activities.length > 0 && done === activities.length) || undefined}>
                {activities.length === 0
                  ? 'Em breve'
                  : done === activities.length
                    ? '★ Nível concluído'
                    : `${done} de ${activities.length}`}
              </small>
            </h2>
            {modules.map((module) => (
              <ModuleCard completed={completed} key={module.id} module={module} />
            ))}
          </section>
        );
      })}
    </main>
  );
}

function ModuleCard({
  module,
  completed,
}: {
  module: CourseModule;
  completed: ReadonlySet<string>;
}) {
  const finished = module.activities.every((activity) => completed.has(activity.id));
  return (
    <section className={styles.module}>
      <h3>
        {module.title}
        {finished ? <small>✓ Módulo concluído</small> : null}
      </h3>
      <ol>
        {module.activities.map((activity) => (
          <li key={activity.id}>
            {isUnlocked(activity.id, completed) ? (
              <Link
                data-done={completed.has(activity.id) || undefined}
                href={`/app/curso/${activity.id}`}
              >
                <span>{activity.title}</span>
                <small>
                  {completed.has(activity.id) ? '✓ Concluída' : `${activity.steps.length} passos`}
                </small>
              </Link>
            ) : (
              <span aria-disabled="true" className={styles.locked}>
                <span>{activity.title}</span>
                <small>🔒 Bloqueada</small>
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
