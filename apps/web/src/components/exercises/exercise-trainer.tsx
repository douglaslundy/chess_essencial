'use client';

import type {
  ExerciseMetrics,
  ExerciseSearchResult,
  ExerciseSolution,
  ExerciseTrainingView,
} from '@xadrez/contracts';
import { useCallback, useEffect, useState } from 'react';

import { api } from '@/lib/api/client';

import styles from './exercise-trainer.module.css';

const emptySearch: ExerciseSearchResult = { items: [], limit: 20, offset: 0, total: 0 };
const emptyMetrics: ExerciseMetrics = {
  accuracyPercent: 0,
  attempted: 0,
  averageDurationMs: 0,
  correct: 0,
  hintsUsed: 0,
};

export function ExerciseTrainer() {
  const [category, setCategory] = useState('');
  const [moduleNumber, setModuleNumber] = useState('');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(emptySearch);
  const [metrics, setMetrics] = useState(emptyMetrics);
  const [training, setTraining] = useState<ExerciseTrainingView | null>(null);
  const [line, setLine] = useState('');
  const [hint, setHint] = useState('');
  const [solution, setSolution] = useState<ExerciseSolution | null>(null);
  const [message, setMessage] = useState('Carregando exercícios…');
  const [startedAt, setStartedAt] = useState(0);

  function token() {
    return window.localStorage.getItem('xadrez.access_token');
  }

  const filters = useCallback(() => {
    const value = new URLSearchParams();
    if (query.trim()) value.set('q', query.trim());
    if (category.trim()) value.set('category', category.trim());
    if (moduleNumber) value.set('module', moduleNumber);
    return value;
  }, [category, moduleNumber, query]);

  const load = useCallback(async () => {
    const accessToken = token();
    if (!accessToken) return setMessage('Entre na sua conta para acessar os exercícios.');
    try {
      const [exercises, performance] = await Promise.all([
        api.searchExercises(filters(), accessToken),
        api.getExerciseMetrics(accessToken),
      ]);
      setResult(exercises);
      setMetrics(performance);
      setMessage(exercises.total ? '' : 'Nenhum exercício corresponde aos filtros.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao carregar exercícios.');
    }
  }, [filters]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  async function startTraining() {
    const accessToken = token();
    if (!accessToken) return;
    const search = filters();
    const parsedModule = search.get('module');
    try {
      const value = await api.startExerciseTraining(
        {
          filters: {
            ...(search.get('category') ? { category: search.get('category')! } : {}),
            limit: 10,
            ...(parsedModule ? { module: Number(parsedModule) } : {}),
            ...(search.get('q') ? { q: search.get('q')! } : {}),
          },
        },
        accessToken,
      );
      setTraining(value);
      setHint('');
      setSolution(null);
      setStartedAt(Date.now());
      setMessage(
        value.total ? 'Treino iniciado.' : 'Nenhum exercício disponível para este treino.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao iniciar treino.');
    }
  }

  async function revealHint() {
    const accessToken = token();
    if (!accessToken || !training) return;
    try {
      const value = await api.revealExerciseHint(training.sessionId, accessToken);
      setHint(value.hint);
      setMessage(`Dica ${value.hintNumber} revelada; ${value.remaining} restante(s).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nenhuma dica disponível.');
    }
  }

  async function revealSolution() {
    const accessToken = token();
    if (!accessToken || !training) return;
    try {
      setSolution(await api.revealExerciseSolution(training.sessionId, accessToken));
      setMessage('Solução revelada e registrada.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao revelar solução.');
    }
  }

  async function submit() {
    const accessToken = token();
    const exercise = training?.currentExercise;
    const submittedLine = line.trim().split(/\s+/).filter(Boolean);
    if (!accessToken || !training || !exercise || submittedLine.length === 0) return;
    try {
      const attempt = await api.submitExerciseAttempt(
        exercise.id,
        {
          durationMs: Math.max(0, Date.now() - startedAt),
          submittedLine,
          trainingSessionId: training.sessionId,
        },
        accessToken,
      );
      setTraining(attempt.training);
      setLine('');
      setHint('');
      setSolution(null);
      setStartedAt(Date.now());
      setMessage(attempt.correct ? `Correto. Pontuação: ${attempt.score}.` : 'Resposta incorreta.');
      setMetrics(await api.getExerciseMetrics(accessToken));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao avaliar tentativa.');
    }
  }

  const current = training?.currentExercise;
  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <span>Treino autoritativo</span>
        <h1>Exercícios de Xadrez Essencial</h1>
        <p>Busque por tema e módulo; as respostas são avaliadas e persistidas pelo servidor.</p>
      </header>

      <section className={styles.metrics} aria-label="Métricas de exercícios">
        <div>
          <strong>{metrics.attempted}</strong>
          <span>Tentativas</span>
        </div>
        <div>
          <strong>{metrics.correct}</strong>
          <span>Corretas</span>
        </div>
        <div>
          <strong>{metrics.accuracyPercent}%</strong>
          <span>Precisão</span>
        </div>
        <div>
          <strong>{metrics.averageDurationMs} ms</strong>
          <span>Tempo médio</span>
        </div>
      </section>

      <section className={styles.filters} aria-label="Filtros de exercícios">
        <label>
          Busca
          <input onChange={(event) => setQuery(event.target.value)} value={query} />
        </label>
        <label>
          Categoria
          <input onChange={(event) => setCategory(event.target.value)} value={category} />
        </label>
        <label>
          Módulo
          <input
            min="1"
            max="10"
            onChange={(event) => setModuleNumber(event.target.value)}
            type="number"
            value={moduleNumber}
          />
        </label>
        <button onClick={load} type="button">
          Buscar
        </button>
        <button onClick={startTraining} type="button">
          Treinar resultados
        </button>
      </section>

      <p className={styles.status} role="status">
        {message}
      </p>

      {current ? (
        <section className={styles.training} aria-label="Exercício atual">
          <div className={styles.progress}>
            Exercício {training.position} de {training.total}
          </div>
          <span className={styles.badge}>
            {current.positionType === 'illustrative_diagram'
              ? 'Diagrama ilustrativo'
              : 'Posição legal'}
          </span>
          <h2>{current.title ?? `Exercício ${current.sourceNumber ?? ''}`}</h2>
          <p>{current.promptMd}</p>
          {current.fen ? <code className={styles.fen}>{current.fen}</code> : null}
          {hint ? (
            <aside className={styles.feedback}>
              <strong>Dica:</strong> {hint}
            </aside>
          ) : null}
          {solution ? (
            <aside className={styles.feedback}>
              <strong>Solução:</strong> {solution.solutionMd}
            </aside>
          ) : null}
          <label className={styles.answer}>
            Linha em UCI, separada por espaços
            <input
              placeholder="e2e4 e7e5"
              onChange={(event) => setLine(event.target.value)}
              value={line}
            />
          </label>
          <div className={styles.actions}>
            <button onClick={submit} type="button">
              Enviar tentativa
            </button>
            <button onClick={revealHint} type="button">
              Pedir dica
            </button>
            <button onClick={revealSolution} type="button">
              Ver solução
            </button>
          </div>
        </section>
      ) : training?.status === 'completed' ? (
        <section className={styles.training}>
          <h2>Treino concluído</h2>
          <p>{training.completed} exercícios registrados.</p>
        </section>
      ) : null}

      <section className={styles.results} aria-label="Resultados da busca">
        <h2>{result.total} exercício(s) encontrado(s)</h2>
        <div className={styles.grid}>
          {result.items.map((exercise) => (
            <article key={exercise.id}>
              <span>{exercise.category ?? 'Sem categoria'}</span>
              <h3>{exercise.title ?? `Exercício ${exercise.sourceNumber ?? ''}`}</h3>
              <p>{exercise.promptMd}</p>
              <small>
                Módulo {exercise.moduleNumber ?? '—'} ·{' '}
                {exercise.positionType === 'legal_position' ? 'posição legal' : 'diagrama'}
              </small>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
