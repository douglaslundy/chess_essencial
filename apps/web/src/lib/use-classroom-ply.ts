import { useEffect, useRef } from 'react';

import { CLASSROOM_EVENT, readClassroomSession } from '@/lib/classroom-session';
import { useTutorContent, type TutorContent } from '@/lib/tutor-store';

const PARAM = 'ply';
const STUDENT_POLL_MS = 500;

/**
 * Replicates the move shown on a board during a class. The teacher writes it into the URL
 * (`?ply=N`), which ClassroomSync already publishes; the student's page reads it back from the URL
 * after ClassroomSync navigates there. The student's own clicks stick until the teacher moves again.
 * `tutor` tells the AI tutor what this page shows; the tutor frame is `ply` (+ `frameOffset`).
 */
export function useClassroomPly(
  ply: number,
  setPly: (ply: number) => void,
  lastPly: number,
  tutor?: { content: TutorContent; frameOffset?: number } | null,
) {
  const lastSeen = useRef<number | null>(null);
  useTutorContent(tutor?.content ?? null, ply + (tutor?.frameOffset ?? 0));

  useEffect(() => {
    const role = readClassroomSession()?.role;
    if (role !== 'teacher') return;
    const url = new URL(window.location.href);
    if (url.searchParams.get(PARAM) === String(ply)) return;
    url.searchParams.set(PARAM, String(ply));
    window.history.replaceState(window.history.state, '', url);
  }, [ply]);

  useEffect(() => {
    if (lastPly <= 0) return;
    lastSeen.current = null;
    function follow() {
      if (readClassroomSession()?.role !== 'student') return;
      const raw = new URL(window.location.href).searchParams.get(PARAM);
      const target = raw === null ? NaN : Number(raw);
      if (!Number.isInteger(target) || target === lastSeen.current) return;
      lastSeen.current = target;
      setPly(Math.min(Math.max(target, 0), lastPly));
    }
    follow();
    const interval = setInterval(follow, STUDENT_POLL_MS);
    window.addEventListener(CLASSROOM_EVENT, follow);
    return () => {
      clearInterval(interval);
      window.removeEventListener(CLASSROOM_EVENT, follow);
    };
  }, [setPly, lastPly]);
}
