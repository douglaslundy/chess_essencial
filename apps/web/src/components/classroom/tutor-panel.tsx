'use client';

import { useCallback, useEffect, useState } from 'react';

import type { TutorFrame, TutorLesson } from '@xadrez/contracts';

import { api } from '@/lib/api/client';
import { setTutorActive, useTutorState } from '@/lib/tutor-store';

const POLL_MS = 2_000;
const SIDE_KEY = 'xadrez.tutor_side';

function accessToken() {
  return window.localStorage.getItem('xadrez.access_token');
}

/** True when the signed-in user has the teacher profile (an admin has every profile). */
function useTutorAccess(enabled: boolean): boolean {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const token = enabled ? accessToken() : null;
    if (!token) return;
    let active = true;
    api
      .getTutorAccess(token)
      .then((result) => active && setAllowed(result.allowed))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [enabled]);
  return enabled && allowed;
}

function frameAt(frames: TutorFrame[], index: number): TutorFrame | null {
  return frames.find((frame) => frame.index === index) ?? null;
}

function readSide(): 'left' | 'right' {
  try {
    return window.localStorage.getItem(SIDE_KEY) === 'left' ? 'left' : 'right';
  } catch {
    return 'right';
  }
}

/**
 * The AI tutor, only for the teacher: a "Tutor de IA" button in the class banner (once a content is
 * open) and a small translucent card with the previous, current and next frame. It lives only in
 * this browser, so students never see it and think the teacher knows it all.
 */
export function TutorButton({ isTeacher }: { isTeacher: boolean }) {
  const allowed = useTutorAccess(isTeacher);
  const { active, content } = useTutorState();
  if (!allowed || !content) return null;
  return (
    <button
      aria-pressed={active}
      className={active ? 'tutorToggle tutorToggleOn' : 'tutorToggle'}
      onClick={() => setTutorActive(!active)}
      type="button"
    >
      {active ? 'Fechar o Tutor de IA' : 'Tutor de IA'}
    </button>
  );
}

export function TutorCard() {
  const { active, content, frame } = useTutorState();
  const [lesson, setLesson] = useState<TutorLesson | null>(null);
  const [error, setError] = useState('');
  const [side, setSide] = useState<'left' | 'right'>('right');
  const [collapsed, setCollapsed] = useState(false);

  const contentKey = content ? `${content.kind}:${content.contentId}` : '';
  const load = useCallback(async () => {
    const token = accessToken();
    if (!content || !token) return null;
    // The first call starts the generation (or returns the stored lesson at once).
    return api.requestTutorLesson(
      {
        contentId: content.contentId,
        kind: content.kind,
        ...(content.steps ? { steps: content.steps } : {}),
      },
      token,
    );
    // The content object is rebuilt on every render; its key identifies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey]);

  useEffect(() => {
    queueMicrotask(() => setSide(readSide()));
  }, []);

  useEffect(() => {
    if (!active || !contentKey) return;
    let live = true;
    let timer: number | undefined;
    async function tick() {
      try {
        const next = await load();
        if (!live || !next) return;
        setLesson(next);
        setError('');
        if (next.status === 'generating') timer = window.setTimeout(() => void tick(), POLL_MS);
      } catch (cause) {
        if (live) setError(cause instanceof Error ? cause.message : 'Falha ao preparar a aula.');
      }
    }
    void tick();
    return () => {
      live = false;
      window.clearTimeout(timer);
      setLesson(null);
      setError('');
    };
  }, [active, contentKey, load]);

  if (!active || !content) return null;

  const frames = lesson?.frames ?? [];
  const previous = frame > 0 ? frameAt(frames, frame - 1) : null;
  const current = frameAt(frames, frame);
  const next = frameAt(frames, frame + 1);
  const preparing = !current && !error && lesson?.status !== 'failed';
  const failed = lesson?.status === 'failed';

  function flip() {
    const target = side === 'right' ? 'left' : 'right';
    setSide(target);
    try {
      window.localStorage.setItem(SIDE_KEY, target);
    } catch {
      // Not saved: the side lasts for this page only.
    }
  }

  return (
    <aside
      aria-label="Tutor de IA"
      className={`tutorCard tutorCard-${side}${collapsed ? ' tutorCardCollapsed' : ''}`}
    >
      <header>
        <strong>Tutor de IA</strong>
        <span>
          <button aria-label="Mover para o outro lado" onClick={flip} type="button">
            ⇄
          </button>
          <button
            aria-label={collapsed ? 'Abrir o tutor' : 'Recolher o tutor'}
            onClick={() => setCollapsed(!collapsed)}
            type="button"
          >
            {collapsed ? '▢' : '–'}
          </button>
        </span>
      </header>
      {collapsed ? null : (
        <div className="tutorFrames">
          {previous ? (
            <p className="tutorPrev">
              <b>{previous.label}</b>
              {previous.text}
            </p>
          ) : null}
          {current ? (
            <p className="tutorNow">
              <b>{current.label}</b>
              {current.text}
            </p>
          ) : (
            <p className="tutorNow" role="status">
              {error
                ? error
                : failed
                  ? 'A IA não conseguiu gerar esta aula. Feche e abra o tutor para tentar de novo.'
                  : preparing
                    ? 'Preparando a aula…'
                    : ''}
            </p>
          )}
          {next ? (
            <p className="tutorNext">
              <b>Próximo: {next.label}</b>
            </p>
          ) : null}
        </div>
      )}
    </aside>
  );
}
