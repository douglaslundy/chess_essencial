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
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<string>>(new Set());
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
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    api
      .getCourseProgress(params.slug, token)
      .then((progress) => setCompletedLessonIds(new Set(progress.completedLessonIds)))
      .catch(() => undefined);
  }, [params.slug]);

  const totalLessons = course?.modules.reduce((sum, module) => sum + module.lessons.length, 0) ?? 0;

  return (
    <main className={styles.page}>
      <Link className={styles.backLink} href="/app/cursos">
        ← Todos os cursos
      </Link>
      <header className={styles.heading}>
        <span>Curso publicado</span>
        <h1>{course?.title ?? 'Aulas'}</h1>
        <p>{course?.description}</p>
        {totalLessons > 0 ? (
          <p>
            {completedLessonIds.size}/{totalLessons} aulas concluídas
          </p>
        ) : null}
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
              {module.lessons.map((lesson) => {
                const completed = completedLessonIds.has(lesson.id);
                return (
                  <Link href={`/app/aula/${lesson.id}`} key={lesson.id}>
                    <span>{completed ? '✓' : lesson.position}</span>
                    <strong>{lesson.title}</strong>
                    <small>{completed ? 'Concluída' : `${lesson.estimatedMinutes} min`}</small>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
