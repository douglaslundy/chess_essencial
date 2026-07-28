'use client';

import type { LearningMap as LearningMapData, LearningProgress } from '@xadrez/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api/client';

const STATUS_ICON: Record<string, string> = {
  completed: '✓',
  current: '●',
  locked: '🔒',
};

export function LearningMap() {
  const [map, setMap] = useState<LearningMapData | null>(null);
  const [progress, setProgress] = useState<LearningProgress | null>(null);
  const [message, setMessage] = useState('Carregando sua jornada…');

  useEffect(() => {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) {
      queueMicrotask(() => setMessage('Entre na sua conta para ver sua jornada.'));
      return;
    }
    Promise.all([api.getLearningMap(token), api.getLearningProgress(token)])
      .then(([nextMap, nextProgress]) => {
        setMap(nextMap);
        setProgress(nextProgress);
        setMessage(
          nextMap.worlds.length === 0 ? 'A jornada ainda não tem conteúdo publicado.' : '',
        );
      })
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : 'Falha ao carregar a jornada.'),
      );
  }, []);

  return (
    <main className="learningPathPage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Treinamento</p>
          <h1>Sua jornada</h1>
        </div>
        {progress ? (
          <p>
            {progress.xp} XP · sequência de {progress.streakDays}{' '}
            {progress.streakDays === 1 ? 'dia' : 'dias'}
          </p>
        ) : null}
      </header>
      <p className="status" role="status">
        {message}
      </p>
      <div className="learningMap">
        {(map?.worlds ?? []).map((world) => (
          <section aria-label={world.title} className="worldSection" key={world.id}>
            <h2>
              {world.position}. {world.title}
            </h2>
            <p>{world.description}</p>
            <ol className="levelPath">
              {world.levels.map((level) => {
                const disabled = level.status === 'locked';
                const content = (
                  <>
                    <span aria-hidden="true" className={`levelNode levelNode--${level.status}`}>
                      {level.isCapstone && level.status !== 'locked'
                        ? '🏆'
                        : STATUS_ICON[level.status]}
                    </span>
                    <span className="levelNodeLabel">
                      {level.title}
                      <small>
                        {level.completedStageCount}/{level.stageCount} etapas
                      </small>
                    </span>
                  </>
                );
                return (
                  <li className="levelPathItem" key={level.id}>
                    {disabled ? (
                      <span aria-disabled="true" className="levelNodeLink levelNodeLink--disabled">
                        {content}
                      </span>
                    ) : (
                      <Link className="levelNodeLink" href={`/app/treinamento/nivel/${level.id}`}>
                        {content}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </main>
  );
}
