'use client';

import type { LearningLevelDetail } from '@xadrez/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api/client';

const STAGE_LABEL: Record<string, string> = {
  boss: 'Desafio final',
  challenge: 'Desafio',
  checkpoint: 'Checkpoint',
  lesson: 'Aula',
  review: 'Revisão',
};

const STATUS_ICON: Record<string, string> = {
  available: '●',
  completed: '✓',
  locked: '🔒',
};

export function LevelDetail({ levelId }: { levelId: string }) {
  const [level, setLevel] = useState<LearningLevelDetail | null>(null);
  const [message, setMessage] = useState('Carregando nível…');

  useEffect(() => {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) {
      queueMicrotask(() => setMessage('Entre na sua conta.'));
      return;
    }
    api
      .getLearningLevel(levelId, token)
      .then((next) => {
        setLevel(next);
        setMessage('');
      })
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : 'Falha ao carregar o nível.'),
      );
  }, [levelId]);

  return (
    <main className="learningLevelPage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Treinamento</p>
          <h1>{level?.title ?? 'Nível'}</h1>
        </div>
        <Link href="/app/treinamento">← Voltar ao mapa</Link>
      </header>
      <p className="status" role="status">
        {message}
      </p>
      {level ? (
        <ol className="stageList">
          {level.stages.map((stage) => {
            const disabled = stage.status === 'locked';
            return (
              <li className={`stageListItem stageListItem--${stage.status}`} key={stage.id}>
                {disabled ? (
                  <span aria-disabled="true" className="stageListLink stageListLink--disabled">
                    <span aria-hidden="true">{STATUS_ICON[stage.status]}</span>
                    {STAGE_LABEL[stage.type] ?? stage.type} {stage.position}
                  </span>
                ) : (
                  <Link className="stageListLink" href={`/app/treinamento/etapa/${stage.id}`}>
                    <span aria-hidden="true">{STATUS_ICON[stage.status]}</span>
                    {STAGE_LABEL[stage.type] ?? stage.type} {stage.position}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      ) : null}
    </main>
  );
}
