'use client';

import type { CourseSummary } from '@xadrez/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api/client';
import styles from '@/components/portal/portal-pages.module.css';

export default function CoursesPage() {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [message, setMessage] = useState('Carregando cursos…');

  useEffect(() => {
    api
      .listCourses()
      .then((value) => {
        setCourses(value);
        setMessage(value.length ? '' : 'Nenhum curso publicado.');
      })
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : 'Não foi possível carregar os cursos.'),
      );
  }, []);

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <span>Trilha de aprendizagem</span>
        <h1>Cursos e aulas</h1>
        <p>Estude os dez volumes do Xadrez Essencial e pratique cada conceito.</p>
      </header>
      <p className={styles.status} role="status">
        {message}
      </p>
      <section className={styles.cardGrid} aria-label="Cursos publicados">
        {courses.map((course) => (
          <article className={styles.card} key={course.id}>
            <span>{course.moduleCount} módulos</span>
            <h2>{course.title}</h2>
            <p>{course.description}</p>
            <Link className={styles.primaryLink} href={`/app/cursos/${course.slug}`}>
              Ver aulas
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
