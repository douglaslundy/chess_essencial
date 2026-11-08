'use client';

import { useClassroomPly } from '@/lib/use-classroom-ply';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { findActivity, isUnlocked } from './course-content';
import { CoursePuzzle } from './course-puzzle';
import { applyCourseMove, initialStepState, type StepState } from './course-step';
import type { CourseStep } from './course-types';
import styles from './course.module.css';
import { CoachCallout } from '@/components/coach/coach-callout';
import { ChessBoard } from '@/components/game/chess-board';
import { api } from '@/lib/api/client';
import { speakableSquares } from '@/lib/notation';
import { usePieceTheme } from '@/lib/piece-theme';
import { getNarrationRate, prefetchSpeech, speak, stopSpeaking } from '@/lib/speech';
import { useVoicePreference } from '@/lib/voice-preference';

const DONE_SAY = 'Muito bem!';
const NO_STEPS: CourseStep[] = [];
const NEXT_DELAY_MS = 2000;
// shortcut: browser speech has no end event here, so explanations wait an estimated reading time.
const readingMs = (text: string) => NEXT_DELAY_MS + (text.length * 65) / getNarrationRate();

export function CoursePlayer({ activityId }: { activityId: string }) {
  const found = findActivity(activityId);
  const { theme: pieceTheme } = usePieceTheme();
  const { voiceName } = useVoicePreference();
  const [index, setIndex] = useState(0);
  const [state, setState] = useState<StepState | null>(() =>
    found ? initialStepState(found.activity.steps[0]!) : null,
  );
  const [audio, setAudio] = useState(true);
  // The lesson waits for "Iniciar aula": browsers only speak after a user gesture.
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  // null while the progress loads; a direct link to a locked activity shows the lock instead.
  const [locked, setLocked] = useState<boolean | null>(null);
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

  const steps = found?.activity.steps ?? NO_STEPS;
  const step = steps[index];
  const last = index === steps.length - 1;
  const done = state?.status === 'done';
  const message = state?.feedback ?? (done && step?.kind !== 'info' ? DONE_SAY : (step?.say ?? ''));

  // The AI voice takes seconds to generate a new clip: prepare every step's narration as soon as
  // the lesson opens, in step order, so speech starts at once.
  useEffect(() => {
    prefetchSpeech(
      [...steps.map((item) => speakableSquares(item.say)), speakableSquares(DONE_SAY)],
      voiceName,
    );
  }, [steps, voiceName]);

  // Key of the last message whose speech ended: a finished step waits for it before moving on.
  const [spoken, setSpoken] = useState('');
  const speechKey = `${round}:${message}`;

  // The coach speaks the current instruction only: a new step or a move cuts the previous speech.
  useEffect(() => {
    if (!started || !audio || !message) return;
    let live = true;
    const onEnd = () => live && setSpoken(speechKey);
    // shortcut: a voice that never reports its end would freeze the lesson, so a generous cap moves on.
    const cap = window.setTimeout(onEnd, readingMs(message) * 3 + 10_000);
    void speak(speakableSquares(message), { interrupt: true, onEnd, voiceName }).catch(
      () =>
        void speak(speakableSquares(message), { interrupt: true, onEnd }).catch(() => undefined),
    );
    return () => {
      live = false;
      window.clearTimeout(cap);
    };
  }, [started, audio, message, voiceName, speechKey]);

  const goTo = useCallback(
    (next: number) => {
      const target = steps[next];
      if (!target) return;
      stopSpeaking();
      setIndex(next);
      setRound((value) => value + 1);
      setState(initialStepState(target));
    },
    [steps],
  );
  useClassroomPly(index, goTo, steps.length - 1, {
    content: {
      contentId: activityId,
      kind: 'lesson',
      steps: steps.map((item) => ({ say: item.say || 'Passo sem texto.' })),
    },
    frameOffset: 1,
  });

  // A finished step moves on by itself 2 s after the coach finished speaking; without audio,
  // after the reading time of an explanation.
  const speechDone = !audio || !message || spoken === speechKey;
  useEffect(() => {
    if (!started || !done || finished || !step || !speechDone) return;
    const timer = window.setTimeout(
      () => (last ? setFinished(true) : goTo(index + 1)),
      !audio && step.kind === 'info' ? readingMs(step.say) : NEXT_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [started, done, finished, step, last, index, goTo, speechDone, audio]);

  useEffect(() => {
    if (!audio) stopSpeaking();
    return () => stopSpeaking();
  }, [audio]);

  useEffect(() => {
    const token = window.localStorage.getItem('xadrez.access_token');
    const check = token
      ? api
          .getCourseTrailProgress(token)
          .then((progress) => !isUnlocked(activityId, new Set(progress.completedActivityIds)))
          // A failed check does not block the student: the lock is a guide, not a permission.
          .catch(() => false)
      : Promise.resolve(!isUnlocked(activityId, new Set()));
    let live = true;
    void check.then((value) => live && setLocked(value));
    return () => {
      live = false;
    };
  }, [activityId]);

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

  if (found && locked) {
    return (
      <main className={styles.page}>
        <p role="status">
          🔒 Conclua a atividade anterior para abrir &quot;{found.activity.title}&quot;.
        </p>
        <Link className={styles.back} href="/app/curso">
          ← Voltar ao curso
        </Link>
      </main>
    );
  }

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
              disabled={done || !started}
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
            {started ? (
              <>
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
              </>
            ) : (
              <button
                className={styles.ready}
                disabled={locked !== false}
                onClick={() => setStarted(true)}
                type="button"
              >
                Iniciar aula
              </button>
            )}
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
