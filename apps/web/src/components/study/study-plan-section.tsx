'use client';

import type { GameStudyPlan } from '@xadrez/contracts';
import { useEffect, useState } from 'react';

import { ExerciseDialog } from './exercise-dialog';
import { LibraryGameDialog } from './library-game-dialog';
import { api } from '@/lib/api/client';

type Open = { id: string; kind: 'exercise' | 'game'; title: string } | null;

/** What to study after a game: themes, exercises and 3 library games, each opened in a modal. */
export function StudyPlanSection({ gameId }: { gameId: string }) {
  const [plan, setPlan] = useState<GameStudyPlan | null>(null);
  const [open, setOpen] = useState<Open>(null);

  useEffect(() => {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    api
      .getGameStudyPlan(gameId, token)
      .then(setPlan)
      .catch(() => setPlan(null));
  }, [gameId]);

  // Saved in the database first, so the checkmark shows on any computer the student logs in from.
  function markDone(kind: 'exercise' | 'game', id: string) {
    setPlan((current) =>
      current
        ? {
            ...current,
            exercises: current.exercises.map((item) =>
              kind === 'exercise' && item.id === id ? { ...item, done: true } : item,
            ),
            libraryGames: current.libraryGames.map((item) =>
              kind === 'game' && item.id === id ? { ...item, done: true } : item,
            ),
          }
        : current,
    );
    const token = window.localStorage.getItem('xadrez.access_token');
    if (token) void api.markStudyItemDone(kind, id, token).catch(() => undefined);
  }

  if (!plan) return null;
  const untrainable = plan.themes.filter((theme) => !theme.hasExercises);

  return (
    <section aria-labelledby="study-plan-title" className="reviewNarration">
      <div className="reviewNarrationHeader">
        <h2 id="study-plan-title">O que estudar para melhorar</h2>
      </div>
      <ul className="studyThemes">
        {plan.themes.map((theme) => (
          <li key={theme.key}>
            <strong>{theme.label}:</strong> {theme.reason}
            {theme.hasExercises ? '' : ' (ainda não há exercícios cadastrados para este tema)'}
          </li>
        ))}
      </ul>

      {plan.libraryGames.length > 0 ? (
        <>
          <h3>{plan.libraryGames.length} partidas para estudar</h3>
          <ol className="studyList">
            {plan.libraryGames.map((game) => (
              <li key={game.id}>
                <button
                  className="studyLink"
                  onClick={() => setOpen({ id: game.id, kind: 'game', title: game.title })}
                  type="button"
                >
                  {game.done ? '✓ ' : ''}
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
          <h3>{plan.exercises.length} exercícios para praticar</h3>
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
                  {exercise.done ? '✓ ' : ''}
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
      ) : untrainable.length === plan.themes.length ? (
        <p>Não há exercícios cadastrados para os temas desta partida.</p>
      ) : null}

      {open?.kind === 'exercise' ? (
        <ExerciseDialog
          exerciseId={open.id}
          onClose={() => setOpen(null)}
          onSolved={() => markDone('exercise', open.id)}
          title={open.title}
        />
      ) : null}
      {open?.kind === 'game' ? (
        <LibraryGameDialog
          gameId={open.id}
          onClose={() => setOpen(null)}
          onFinished={() => markDone('game', open.id)}
          title={open.title}
        />
      ) : null}
    </section>
  );
}
