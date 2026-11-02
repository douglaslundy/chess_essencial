'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { COURSE_MODULES, isUnlocked } from './course-content';
import type { CourseModule } from './course-types';
import styles from './course.module.css';
import { api } from '@/lib/api/client';

const LEVELS = ['Regras', 'Iniciante', 'Básico', 'Intermediário', 'Avançado'];
const NONE: ReadonlySet<string> = new Set();
// Display order: level by level, modules in content order.
const ORDER = LEVELS.flatMap((_, level) =>
  COURSE_MODULES.filter((module) => module.level === level).flatMap((module) =>
    module.activities.map((activity) => ({ activity, module })),
  ),
);

export function CourseMap() {
  // null while the progress loads, so "continuar" never flashes the first lesson.
  const [progress, setProgress] = useState<ReadonlySet<string> | null>(null);
  const completed = progress ?? NONE;

  useEffect(() => {
    const token = window.localStorage.getItem('xadrez.access_token');
    const load = token
      ? api
          .getCourseTrailProgress(token)
          .then((result) => new Set(result.completedActivityIds))
          .catch(() => new Set<string>())
      : Promise.resolve(new Set<string>());
    void load.then(setProgress);
  }, []);

  const next = ORDER.find(
    ({ activity }) => !completed.has(activity.id) && isUnlocked(activity.id, completed),
  );

  return (
    <main className={styles.page}>
      <h1>Curso do zero ao avançado</h1>
      {progress === null ? null : next ? (
        <Link className={styles.resume} href={`/app/curso/${next.activity.id}`}>
          <span>
            <small>{completed.size > 0 ? 'Continuar de onde parou' : 'Comece por aqui'}</small>
            <strong>{next.activity.title}</strong>
            <span>{next.module.title}</span>
          </span>
          <span className={styles.resumeButton}>
            {completed.size > 0 ? 'Continuar' : 'Começar'} ▶
          </span>
        </Link>
      ) : (
        <p className={styles.resume}>★ Você concluiu o curso inteiro.</p>
      )}
      {LEVELS.map((name, level) => {
        const modules = COURSE_MODULES.filter((module) => module.level === level);
        const activities = modules.flatMap((module) => module.activities);
        const done = activities.filter((activity) => completed.has(activity.id)).length;
        const levelDone = activities.length > 0 && done === activities.length;
        const heading = (
          <h2 id={`level-${level}`}>
            Nível {level}: {name}
            <small data-done={levelDone || undefined}>
              {activities.length === 0
                ? 'Em breve'
                : levelDone
                  ? '★ Nível concluído'
                  : `${done} de ${activities.length}`}
            </small>
          </h2>
        );
        const cards = modules.map((module) => (
          <ModuleCard completed={completed} key={module.id} module={module} />
        ));
        return (
          <section aria-labelledby={`level-${level}`} className={styles.level} key={name}>
            {/* A finished level folds into one line; the toggle opens it again. */}
            {levelDone ? (
              <details className={styles.fold}>
                <summary>{heading}</summary>
                <div className={styles.level}>{cards}</div>
              </details>
            ) : (
              <>
                {heading}
                {cards}
              </>
            )}
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
  const heading = (
    <h3>
      {module.title}
      {finished ? <small>✓ Módulo concluído</small> : null}
    </h3>
  );
  const list = (
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
  );
  return (
    <section className={styles.module}>
      {finished ? (
        <details className={styles.fold}>
          <summary>{heading}</summary>
          {list}
        </details>
      ) : (
        <>
          {heading}
          {list}
        </>
      )}
    </section>
  );
}
