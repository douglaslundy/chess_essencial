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

// A gentle left-right-left wave, repeating every 8 levels — same idea as
// Duolingo/Chess.com progression maps (path that winds instead of a
// straight list), built with plain percentages so it needs no pixel
// measurement/ResizeObserver: every node and the connecting SVG line
// behind it share this same 0-100 coordinate space.
const WAVE_X_PERCENT = [50, 74, 88, 74, 50, 26, 12, 26];

function nodeXPercent(index: number): number {
  return WAVE_X_PERCENT[index % WAVE_X_PERCENT.length]!;
}

/** Quadratic-curve path connecting each node's center to the next, in the same 0-100 x / row-index y space the nodes are positioned in. */
function connectorPath(count: number): string {
  if (count < 2) return '';
  const points = Array.from({ length: count }, (_, index) => ({
    x: nodeXPercent(index),
    y: index,
  }));
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const midY = (previous.y + current.y) / 2;
    d += ` C ${previous.x} ${midY}, ${current.x} ${midY}, ${current.x} ${current.y}`;
  }
  return d;
}

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
        {(map?.worlds ?? []).map((world) => {
          const totalStages = world.levels.reduce((sum, level) => sum + level.stageCount, 0);
          const completedStages = world.levels.reduce(
            (sum, level) => sum + level.completedStageCount,
            0,
          );
          const worldPercent =
            totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0;
          const rowCount = Math.max(world.levels.length - 1, 1);

          return (
            <section aria-label={world.title} className="worldSection" key={world.id}>
              <div className="worldSectionHeading">
                <div>
                  <h2>
                    {world.position}. {world.title}
                  </h2>
                  <p>{world.description}</p>
                </div>
                <div className="worldProgress" aria-hidden="true">
                  <div className="worldProgressTrack">
                    <div className="worldProgressFill" style={{ width: `${worldPercent}%` }} />
                  </div>
                  <span>
                    {completedStages}/{totalStages} etapas
                  </span>
                </div>
              </div>
              <div
                className="levelPathWrap"
                style={{ '--path-rows': rowCount } as React.CSSProperties}
              >
                <svg
                  aria-hidden="true"
                  className="levelPathLine"
                  preserveAspectRatio="none"
                  viewBox={`0 0 100 ${rowCount}`}
                >
                  <path d={connectorPath(world.levels.length)} fill="none" />
                </svg>
                <ol className="levelPath">
                  {world.levels.map((level, index) => {
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
                    const style = {
                      '--row': index,
                      '--x': `${nodeXPercent(index)}%`,
                    } as React.CSSProperties;
                    return (
                      <li className="levelPathItem" key={level.id} style={style}>
                        {disabled ? (
                          <span
                            aria-disabled="true"
                            className="levelNodeLink levelNodeLink--disabled"
                          >
                            {content}
                          </span>
                        ) : (
                          <Link
                            className={`levelNodeLink${level.status === 'current' ? ' levelNodeLink--current' : ''}`}
                            href={`/app/treinamento/nivel/${level.id}`}
                          >
                            {content}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
