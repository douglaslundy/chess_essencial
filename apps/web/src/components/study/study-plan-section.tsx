'use client';

import type { GameStudyPlan } from '@xadrez/contracts';
import { useEffect, useState } from 'react';

import { ExerciseDialog } from './exercise-dialog';
import { LibraryGameDialog } from './library-game-dialog';
import { api, getStoredUserId } from '@/lib/api/client';
import { markStudyDone, readStudyDone } from '@/lib/study-progress';

type Open = { id: string; kind: 'exercise' | 'game'; title: string } | null;

/** What to study after a game: themes, 5 exercises and 3 library games, each opened in a modal. */
export function StudyPlanSection({ gameId }: { gameId: string }) {
  const userId = getStoredUserId();
  const [plan, setPlan] = useState<GameStudyPlan | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<Open>(null);
  const [doneExercises, setDoneExercises] = useState<Set<string>>(new Set());
  const [doneGames, setDoneGames] = useState<Set<string>>(new Set());

  useEffect(() => {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    queueMicrotask(() => {
      setDoneExercises(readStudyDone(userId, 'exercise'));
      setDoneGames(readStudyDone(userId, 'game'));
    });
    api
      .getGameStudyPlan(gameId, token)
      .then(setPlan)
      .catch(() => setFailed(true));
  }, [gameId, userId]);

  if (failed) return null;
  if (!plan) return null;

  return (
    <section aria-labelledby="study-plan-title" className="reviewNarration">
      <div className="reviewNarrationHeader">
        <h2 id="study-plan-title">O que estudar para melhorar</h2>
      </div>
      <ul className="studyThemes">
        {plan.themes.map((theme) => (
          <li key={theme.key}>
            <strong>{theme.label}:</strong> {theme.reason}
          </li>
        ))}
      </ul>

      {plan.libraryGames.length > 0 ? (
        <>
          <h3>3 partidas para estudar</h3>
          <ol className="studyList">
            {plan.libraryGames.map((game) => (
              <li key={game.id}>
                <button
                  className="studyLink"
                  onClick={() => setOpen({ id: game.id, kind: 'game', title: game.title })}
                  type="button"
                >
                  {doneGames.has(game.id) ? '✓ ' : ''}
                  {game.title}
                </button>
                <span> — {game.focus}</span>
              </li>
            ))}
          </ol>
        </>
      ) : null}

      {plan.exercises.length > 0 ? (
        <>
          <h3>5 exercícios para praticar</h3>
          <ol className="studyList">
            {plan.exercises.map((exercise) => (
              <li key={exercise.id}>
                <button
                  className="studyLink"
                  onClick={() =>
                    setOpen({ id: exercise.id, kind: 'exercise', title: exercise.title })
                  }
                  type="button"
                >
                  {doneExercises.has(exercise.id) ? '✓ ' : ''}
                  {exercise.title}
                </button>
                <span>
                  {' '}
                  — {exercise.theme}
                  {exercise.difficulty ? ` (${exercise.difficulty})` : ''}
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : null}

      {open?.kind === 'exercise' ? (
        <ExerciseDialog
          exerciseId={open.id}
          onClose={() => setOpen(null)}
          onSolved={() => setDoneExercises(markStudyDone(userId, 'exercise', open.id))}
          title={open.title}
        />
      ) : null}
      {open?.kind === 'game' ? (
        <LibraryGameDialog
          gameId={open.id}
          onClose={() => setOpen(null)}
          onFinished={() => setDoneGames(markStudyDone(userId, 'game', open.id))}
          title={open.title}
        />
      ) : null}
    </section>
  );
}
