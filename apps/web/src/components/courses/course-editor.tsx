'use client';

import {
  interactiveLessonSchema,
  type CourseDetail,
  type InteractiveLesson,
} from '@xadrez/contracts';
import { useMemo, useState } from 'react';

import { api } from '@/lib/api/client';

const initialLesson = {
  estimatedMinutes: 8,
  module: 1,
  prerequisites: [],
  slug: 'nova-aula',
  sourcePages: [1],
  steps: [
    {
      bodyMd: 'Apresente o objetivo observável desta etapa.',
      stepKey: 'introducao',
      stepType: 'text',
    },
    {
      bodyMd: 'Resuma o conceito e o erro comum.',
      stepKey: 'resumo',
      stepType: 'summary',
    },
  ],
  title: 'Nova aula',
};

export function CourseEditor() {
  const [courseId, setCourseId] = useState('');
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [source, setSource] = useState(JSON.stringify(initialLesson, null, 2));
  const [expectedVersion, setExpectedVersion] = useState(0);
  const [message, setMessage] = useState('Informe o ID do curso para abrir o editor.');

  const parsed = useMemo(() => {
    try {
      return interactiveLessonSchema.safeParse(JSON.parse(source));
    } catch {
      return { success: false } as const;
    }
  }, [source]);

  function token() {
    return window.localStorage.getItem('xadrez.access_token');
  }

  async function load() {
    const accessToken = token();
    if (!accessToken) return setMessage('Entre em uma conta com permissão editorial.');
    try {
      const value = await api.getCourseEditor(courseId, accessToken);
      setCourse(value);
      setMessage('Curso carregado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao carregar o curso.');
    }
  }

  async function save() {
    const accessToken = token();
    if (!accessToken || !parsed.success) return setMessage('Corrija o JSON antes de salvar.');
    try {
      const version = await api.saveCourseLesson(
        courseId,
        parsed.data.slug,
        { expectedVersion, lesson: parsed.data },
        accessToken,
      );
      setExpectedVersion(version.version);
      setMessage(`Versão ${version.version} salva com snapshot imutável.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao salvar.');
    }
  }

  async function publish() {
    const accessToken = token();
    if (!accessToken) return;
    try {
      await api.publishCourse(courseId, accessToken);
      setMessage('Curso publicado.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao publicar.');
    }
  }

  const lesson = parsed.success ? (parsed.data as InteractiveLesson) : null;
  return (
    <main className="courseEditorPage">
      <header className="pageHeading">
        <span className="eyebrow">CMS editorial</span>
        <h1>Editor do curso</h1>
        <p>Edite o schema da aula e confira o preview antes de versionar.</p>
      </header>
      <section className="courseEditorToolbar">
        <label>
          ID do curso
          <input onChange={(event) => setCourseId(event.target.value)} value={courseId} />
        </label>
        <button disabled={!courseId} onClick={load} type="button">
          Abrir curso
        </button>
        <button disabled={!course} onClick={publish} type="button">
          Publicar curso
        </button>
      </section>
      {course ? (
        <nav className="moduleStrip" aria-label="Módulos importados">
          {course.modules.map((module) => (
            <span key={module.id}>
              {module.position}. {module.title} ({module.lessons.length})
            </span>
          ))}
        </nav>
      ) : null}
      <section className="courseEditorGrid">
        <div className="schemaEditor">
          <label>
            Versão esperada
            <input
              min={0}
              onChange={(event) => setExpectedVersion(Number(event.target.value))}
              type="number"
              value={expectedVersion}
            />
          </label>
          <label>
            JSON da aula
            <textarea
              aria-invalid={!parsed.success}
              onChange={(event) => setSource(event.target.value)}
              spellCheck={false}
              value={source}
            />
          </label>
          <button disabled={!parsed.success || !course} onClick={save} type="button">
            Salvar nova versão
          </button>
        </div>
        <article className="lessonPreview" aria-label="Preview da aula">
          <span className="eyebrow">Preview</span>
          {lesson ? (
            <>
              <h2>{lesson.title}</h2>
              <p>
                Módulo {lesson.module} · {lesson.estimatedMinutes} min · páginas{' '}
                {lesson.sourcePages.join(', ')}
              </p>
              <ol>
                {lesson.steps.map((step) => (
                  <li key={step.stepKey}>
                    <strong>{step.title ?? step.stepKey}</strong>
                    <span>{step.stepType}</span>
                    <p>{step.bodyMd}</p>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p>JSON inválido ou fora do schema da aula.</p>
          )}
        </article>
      </section>
      <p role="status">{message}</p>
    </main>
  );
}
