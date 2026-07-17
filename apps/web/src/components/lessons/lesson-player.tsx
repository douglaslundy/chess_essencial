'use client';

import type { LessonActionInput, LessonAttemptView } from '@xadrez/contracts';
import { useEffect, useState } from 'react';

import { ChessBoard } from '@/components/game/chess-board';
import { api } from '@/lib/api/client';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function LessonPlayer({ lessonId }: { lessonId: string }) {
  const [attempt, setAttempt] = useState<LessonAttemptView | null>(null);
  const [answer, setAnswer] = useState('');
  const [message, setMessage] = useState('Carregando aula…');

  useEffect(() => {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) {
      queueMicrotask(() => setMessage('Entre na sua conta para iniciar a aula.'));
      return;
    }
    api
      .startLessonAttempt(lessonId, token)
      .then((value) => {
        setAttempt(value);
        setMessage('');
      })
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : 'Falha ao carregar aula.'),
      );
  }, [lessonId]);

  async function submit(action: LessonActionInput) {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token || !attempt) return;
    try {
      const value = await api.submitLessonAction(attempt.attemptId, action, token);
      setAttempt(value);
      setAnswer('');
      setMessage(value.feedback ?? '');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível enviar a ação.');
    }
  }

  if (!attempt) {
    return (
      <main className="lessonPlayerPage">
        <p role="status">{message}</p>
      </main>
    );
  }

  const step = attempt.currentStep;
  return (
    <main className="lessonPlayerPage">
      <header className="lessonHeader">
        <div>
          <span className="eyebrow">Aula interativa</span>
          <h1>{step?.title ?? 'Primeiro movimento do peão'}</h1>
        </div>
        <span>
          {attempt.progress.completedSteps}/{attempt.progress.totalSteps}
        </span>
      </header>
      <div className="lessonProgress" aria-label="Progresso da aula">
        <span
          style={{
            width: `${(attempt.progress.completedSteps / attempt.progress.totalSteps) * 100}%`,
          }}
        />
      </div>
      {attempt.status === 'completed' ? (
        <section className="lessonComplete">
          <h2>Aula concluída</h2>
          <p>Nota: {attempt.score ?? 100}%</p>
        </section>
      ) : step ? (
        <section className="lessonRuntimeGrid">
          {step.stepType === 'board_instruction' || step.stepType === 'checkpoint' ? (
            <ChessBoard
              fen={step.initialFen ?? INITIAL_FEN}
              onMove={(uci) => void submit({ type: 'move', uci })}
              orientation={step.orientation ?? 'white'}
            />
          ) : null}
          <article className="lessonStepCard">
            <span>{step.stepType}</span>
            <p>{step.bodyMd}</p>
            {step.stepType === 'quiz' ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit({ type: 'answer', value: answer.trim() });
                }}
              >
                <label>
                  Sua resposta
                  <input onChange={(event) => setAnswer(event.target.value)} value={answer} />
                </label>
                <button disabled={!answer.trim()} type="submit">
                  Responder
                </button>
              </form>
            ) : null}
            {['text', 'explanation', 'summary'].includes(step.stepType) ? (
              <button onClick={() => void submit({ type: 'continue' })} type="button">
                Continuar
              </button>
            ) : null}
            <p className="lessonFeedback" role="status">
              {message}
            </p>
          </article>
        </section>
      ) : null}
    </main>
  );
}
