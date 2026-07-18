'use client';

import type { CourseDetail } from '@xadrez/contracts';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api/client';
import styles from '@/components/portal/portal-pages.module.css';

export default function CourseDetailPage() {
  const params = useParams<{ slug: string }>();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [message, setMessage] = useState('Carregando aulas…');

  useEffect(() => {
    api
      .getCourse(params.slug)
      .then((value) => {
        setCourse(value);
        setMessage('');
      })
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : 'Não foi possível carregar o curso.'),
      );
  }, [params.slug]);

  return (
    <main className={styles.page}>
      <Link className={styles.backLink} href="/app/cursos">
        ← Todos os cursos
      </Link>
      <header className={styles.heading}>
        <span>Curso publicado</span>
        <h1>{course?.title ?? 'Aulas'}</h1>
        <p>{course?.description}</p>
      </header>
      <p className={styles.status} role="status">
        {message}
      </p>
      <div className={styles.moduleList}>
        {course?.modules.map((module) => (
          <section className={styles.moduleCard} key={module.id}>
            <header>
              <span>Volume {module.sourceVolume}</span>
              <h2>{module.title}</h2>
            </header>
            <div className={styles.lessonList}>
              {module.lessons.map((lesson) => (
                <Link href={`/app/aula/${lesson.id}`} key={lesson.id}>
                  <span>{lesson.position}</span>
                  <strong>{lesson.title}</strong>
                  <small>{lesson.estimatedMinutes} min</small>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
