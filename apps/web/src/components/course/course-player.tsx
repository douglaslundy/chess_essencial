'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { findActivity } from './course-content';
import { CoursePuzzle } from './course-puzzle';
import { applyCourseMove, initialStepState, type StepState } from './course-step';
import styles from './course.module.css';
import { CoachCallout } from '@/components/coach/coach-callout';
import { ChessBoard } from '@/components/game/chess-board';
import { api } from '@/lib/api/client';
import { speakableSquares } from '@/lib/notation';
import { usePieceTheme } from '@/lib/piece-theme';
import { speak, stopSpeaking } from '@/lib/speech';
import { useVoicePreference } from '@/lib/voice-preference';

const DONE_SAY = 'Muito bem! Toque na setinha para seguir.';

export function CoursePlayer({ activityId }: { activityId: string }) {
  const found = findActivity(activityId);
  const { theme: pieceTheme } = usePieceTheme();
  const { voiceName } = useVoicePreference();
  const [index, setIndex] = useState(0);
  const [state, setState] = useState<StepState | null>(() =>
    found ? initialStepState(found.activity.steps[0]!) : null,
  );
  const [audio, setAudio] = useState(true);
  const [finished, setFinished] = useState(false);
  const [saveError, setSaveError] = useState('');
  const saved = useRef(false);
  // Bumped on every (re)start so a puzzle step opens a fresh training session.
  const [round, setRound] = useState(0);
  const onPuzzleFeedback = useCallback(
    (feedback: string) => setState((current) => current && { ...current, feedback }),
    [],
  );
  const onPuzzleDone = useCallback(
    () => setState((current) => current && { ...current, feedback: null, status: 'done' }),
    [],
  );

  const steps = found?.activity.steps ?? [];
  const step = steps[index];
  const last = index === steps.length - 1;
  const done = state?.status === 'done';
  const message = state?.feedback ?? (done && step?.kind !== 'info' ? DONE_SAY : (step?.say ?? ''));

  // The coach speaks the current instruction only: a new step or a move cuts the previous speech.
  useEffect(() => {
    if (!audio || !message) return;
    void speak(speakableSquares(message), { interrupt: true, voiceName }).catch(
      () => void speak(speakableSquares(message), { interrupt: true }).catch(() => undefined),
    );
  }, [audio, message, voiceName, index]);

  useEffect(() => {
    if (!audio) stopSpeaking();
    return () => stopSpeaking();
  }, [audio]);

  // Finishing the last step records the activity once (idempotent on the server).
  useEffect(() => {
    if (!finished || saved.current) return;
    saved.current = true;
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    api.completeCourseTrailActivity(activityId, token).catch(() => {
      saved.current = false;
      setSaveError('Não foi possível salvar o seu progresso. Verifique a conexão.');
    });
  }, [finished, activityId]);

  if (!found || !step || !state) {
    return (
      <main className={styles.page}>
        <p role="status">Atividade não encontrada.</p>
        <Link className={styles.back} href="/app/curso">
          ← Voltar ao curso
        </Link>
      </main>
    );
  }

  function goTo(next: number) {
    const target = steps[next];
    if (!target) return;
    stopSpeaking();
    setIndex(next);
    setRound((value) => value + 1);
    setState(initialStepState(target));
  }

  function advance() {
    if (!done) return;
    if (last) setFinished(true);
    else goTo(index + 1);
  }

  function onMove(uci: string) {
    if (!step || !state) return;
    const next = applyCourseMove(step, state, uci);
    if (next) setState(next);
  }

  return (
    <main className="gamePage">
      <aside className="playersColumn">
        <div className="libraryGameInfo">
          <strong>{found.activity.title}</strong>
          <span>
            Passo {index + 1} de {steps.length}
          </span>
          <Link href="/app/curso">← Curso</Link>
        </div>
      </aside>

      <section className="boardColumn" aria-label="Área do tabuleiro">
        <CoachCallout label={`Passo ${index + 1} de ${steps.length}`} message={message} />
        <div className="boardStage">
          {step.kind === 'puzzle' ? (
            <CoursePuzzle
              key={round}
              onDone={onPuzzleDone}
              onFeedback={onPuzzleFeedback}
              pieceTheme={pieceTheme}
              step={step}
            />
          ) : (
            <ChessBoard
              disabled={done}
              fen={state.fen}
              hint={step.kind === 'info' ? step.show : undefined}
              lastMove={state.lastMove ?? undefined}
              marks={state.stars}
              movableColor="w"
              onMove={onMove}
              orientation="white"
              pieceTheme={pieceTheme}
            />
          )}
          <div aria-label="Comandos do curso" className="historyControls" role="group">
            <button
              aria-label="Passo anterior"
              disabled={index === 0}
              onClick={() => goTo(index - 1)}
              type="button"
            >
              ◀
            </button>
            <button
              aria-label="Refazer o passo"
              disabled={step.kind === 'info'}
              onClick={() => goTo(index)}
              title="Refazer o passo"
              type="button"
            >
              ↻
            </button>
            <button
              aria-label={last ? 'Concluir atividade' : 'Próximo passo'}
              className={done ? styles.ready : undefined}
              disabled={!done}
              onClick={advance}
              title={done ? 'Próximo' : 'Cumpra o passo para avançar'}
              type="button"
            >
              ▶
            </button>
            <button
              aria-label={audio ? 'Desligar voz' : 'Ligar voz'}
              aria-pressed={audio}
              onClick={() => setAudio((value) => !value)}
              type="button"
            >
              {audio ? '🔊' : '🔇'}
            </button>
          </div>
        </div>
      </section>

      <aside className="movesPanel">
        <div className="panelTabs" role="tablist" aria-label="Atividade">
          <button aria-selected="true" role="tab" type="button">
            Passos
          </button>
        </div>
        <ol className={styles.stepList}>
          {steps.map((item, position) => (
            <li
              aria-current={position === index ? 'step' : undefined}
              data-state={position < index ? 'done' : position === index ? 'current' : 'todo'}
              key={position}
            >
              {item.say}
            </li>
          ))}
        </ol>
      </aside>

      {finished ? (
        <div className="gameResultOverlay" role="presentation">
          <div
            aria-labelledby="course-done-title"
            aria-modal="true"
            className="gameResultDialog gameResult-win"
            role="dialog"
          >
            <h2 id="course-done-title">Atividade concluída!</h2>
            <p>{saveError || `Você terminou "${found.activity.title}".`}</p>
            <div className={styles.doneActions}>
              {found.next ? (
                <Link autoFocus className="gameResultAction" href={`/app/curso/${found.next.id}`}>
                  Próxima: {found.next.title}
                </Link>
              ) : null}
              <Link className="gameResultAction" href="/app/curso">
                Voltar ao curso
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
