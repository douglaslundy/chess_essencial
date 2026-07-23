'use client';

import type { LessonActionInput, LessonAttemptView, PublicLessonStep } from '@xadrez/contracts';
import { useEffect, useState } from 'react';

import { ChessBoard } from '@/components/game/chess-board';
import { api } from '@/lib/api/client';
import { usePieceTheme } from '@/lib/piece-theme';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function LessonPlayer({ lessonId }: { lessonId: string }) {
  const { theme: pieceTheme } = usePieceTheme();
  const [attempt, setAttempt] = useState<LessonAttemptView | null>(null);
  // Result of a quiz/move action, held back until the learner clicks
  // "Continuar" so they always see the feedback before the step changes.
  const [pendingAttempt, setPendingAttempt] = useState<LessonAttemptView | null>(null);
  const [pendingFeedback, setPendingFeedback] = useState<string | null>(null);
  const [stepHistory, setStepHistory] = useState<PublicLessonStep[]>([]);
  const [viewingHistoryIndex, setViewingHistoryIndex] = useState<number | null>(null);
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
      if (action.type === 'continue') {
        // Pure pagination: the click that triggered this already was the
        // learner's deliberate confirmation, so advance immediately.
        if (attempt.currentStep) setStepHistory((current) => [...current, attempt.currentStep!]);
        setAttempt(value);
        setAnswer('');
        setMessage('');
      } else {
        // Quiz/move actions are implicit submissions with an evaluated
        // result: hold the next step back until the learner acknowledges it.
        setPendingAttempt(value);
        setPendingFeedback(value.feedback ?? 'Registrado.');
        setAnswer('');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível enviar a ação.');
    }
  }

  function acknowledgePending() {
    if (!pendingAttempt) return;
    if (attempt?.currentStep) setStepHistory((current) => [...current, attempt.currentStep!]);
    setAttempt(pendingAttempt);
    setPendingAttempt(null);
    setPendingFeedback(null);
  }

  function viewPreviousStep() {
    setStepHistory((current) => {
      if (current.length === 0) return current;
      setViewingHistoryIndex(current.length - 1);
      return current;
    });
  }

  function stepHistoryBack() {
    setViewingHistoryIndex((index) => (index === null ? null : Math.max(0, index - 1)));
  }

  function stepHistoryForward() {
    setViewingHistoryIndex((index) => {
      if (index === null) return null;
      if (index + 1 >= stepHistory.length) return null;
      return index + 1;
    });
  }

  if (!attempt) {
    return (
      <main className="lessonPlayerPage">
        <p role="status">{message}</p>
      </main>
    );
  }

  const viewingHistory = viewingHistoryIndex !== null;
  const step = viewingHistory ? stepHistory[viewingHistoryIndex]! : attempt.currentStep;
  const readOnly = viewingHistory || Boolean(pendingAttempt);

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
      <div className="lessonStepNav">
        <button
          disabled={viewingHistory ? viewingHistoryIndex === 0 : stepHistory.length === 0}
          onClick={viewingHistory ? stepHistoryBack : viewPreviousStep}
          type="button"
        >
          ← Passo anterior
        </button>
        {viewingHistory ? (
          <button onClick={stepHistoryForward} type="button">
            {viewingHistoryIndex! + 1 < stepHistory.length
              ? 'Próximo passo →'
              : 'Voltar ao atual →'}
          </button>
        ) : null}
      </div>
      {viewingHistory ? (
        <p className="lessonReviewBanner" role="status">
          Revisando um passo já concluído.
        </p>
      ) : null}
      {attempt.status === 'completed' && !viewingHistory ? (
        <section className="lessonComplete">
          <h2>Aula concluída</h2>
          <p>Nota: {attempt.score ?? 100}%</p>
        </section>
      ) : step ? (
        <section
          className={`lessonRuntimeGrid ${step.stepType === 'quiz' ? 'lessonRuntimeGridStacked' : ''}`}
        >
          {step.stepType === 'board_instruction' ||
          step.stepType === 'checkpoint' ||
          (step.stepType === 'quiz' && step.initialFen) ? (
            <ChessBoard
              disabled={readOnly || step.stepType === 'quiz'}
              fen={step.initialFen ?? INITIAL_FEN}
              onMove={(uci) => void submit({ type: 'move', uci })}
              orientation={step.orientation ?? 'white'}
              pieceTheme={pieceTheme}
            />
          ) : null}
          <article className="lessonStepCard">
            <span>{step.stepType}</span>
            <p>{step.bodyMd}</p>
            {step.stepType === 'quiz' && !readOnly ? (
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
            {['text', 'explanation', 'summary'].includes(step.stepType) && !readOnly ? (
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
      {pendingAttempt ? (
        <div className="lessonResultOverlay" role="presentation">
          <div aria-modal="true" className="lessonResultDialog" role="dialog">
            <h2>Resultado registrado</h2>
            <p>{pendingFeedback}</p>
            <button onClick={acknowledgePending} type="button">
              Continuar →
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
