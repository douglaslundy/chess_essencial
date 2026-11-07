'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api/client';
import {
  CLASSROOM_AREAS,
  CLASSROOM_EVENT,
  readClassroomSession,
  writeClassroomSession,
  type ClassroomSession,
} from '@/lib/classroom-session';

const PUBLISH_INTERVAL_MS = 1_500;
const FOLLOW_INTERVAL_MS = 2_000;

function accessToken() {
  return window.localStorage.getItem('xadrez.access_token');
}

/**
 * Banner shown while the user is in a class. The teacher's current page is published to the
 * server; students poll it and follow it. Classroom pages themselves are never replicated.
 */
export function ClassroomSync() {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<ClassroomSession | null>(null);

  useEffect(() => {
    const sync = () => setSession(readClassroomSession());
    queueMicrotask(sync);
    window.addEventListener(CLASSROOM_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CLASSROOM_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const classroomId = session?.id;
  const role = session?.role;

  useEffect(() => {
    if (!classroomId || role !== 'teacher') return;
    let lastPublished = '';
    function publish() {
      const token = accessToken();
      const current = window.location.pathname + window.location.search;
      if (!token || current === lastPublished || current.startsWith('/app/sala')) return;
      lastPublished = current;
      void api.publishClassroomLive(classroomId!, current, token).catch(() => {
        lastPublished = '';
      });
    }
    publish();
    const interval = setInterval(publish, PUBLISH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [classroomId, role, pathname]);

  // The teacher's scroll position (percent of the page) travels in the URL as ?sy=N.
  useEffect(() => {
    if (!classroomId || role !== 'teacher') return;
    let last = -1;
    let timer: number | undefined;
    function write() {
      timer = undefined;
      const room = document.documentElement.scrollHeight - window.innerHeight;
      const percent = room > 0 ? Math.round((window.scrollY / room) * 100) : 0;
      if (Math.abs(percent - last) < 5) return;
      last = percent;
      const url = new URL(window.location.href);
      url.searchParams.set('sy', String(percent));
      window.history.replaceState(window.history.state, '', url);
    }
    function onScroll() {
      timer ??= window.setTimeout(write, 800);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.clearTimeout(timer);
    };
  }, [classroomId, role, pathname]);

  useEffect(() => {
    if (!classroomId || role !== 'student') return;
    let lastSeq = -1;
    let active = true;
    async function follow() {
      const token = accessToken();
      if (!token) return;
      try {
        const live = await api.getClassroomLive(classroomId!, token);
        if (!active || live.seq === lastSeq) return;
        lastSeq = live.seq;
        const current = window.location.pathname + window.location.search;
        if (live.path !== current) router.push(live.path);
        const rawSy = new URL(live.path, window.location.origin).searchParams.get('sy');
        const sy = Number(rawSy);
        if (rawSy !== null && Number.isFinite(sy)) {
          window.setTimeout(() => {
            const room = document.documentElement.scrollHeight - window.innerHeight;
            window.scrollTo({ top: (room * Math.min(sy, 100)) / 100, behavior: 'smooth' });
          }, 700);
        }
      } catch {
        // Offline or class deleted: try again on the next tick.
      }
    }
    void follow();
    const interval = setInterval(() => void follow(), FOLLOW_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [classroomId, role, router]);

  if (!session) return null;
  return (
    <div aria-label="Aula ao vivo" className="classroomBanner" role="region">
      <strong>
        {session.role === 'teacher'
          ? `Você está dando a aula “${session.name}”`
          : `Você está na aula “${session.name}”: acompanhando o professor`}
      </strong>
      {session.role === 'teacher' ? (
        <nav aria-label="Áreas da aula" className="classroomAreas">
          {CLASSROOM_AREAS.map((area) => (
            <Link
              className={pathname.startsWith(area.href) ? 'activeNav' : undefined}
              href={area.href}
              key={area.href}
            >
              {area.label}
            </Link>
          ))}
        </nav>
      ) : null}
      <Link href={`/app/sala/${session.id}`}>Sala</Link>
      <button onClick={() => writeClassroomSession(null)} type="button">
        {session.role === 'teacher' ? 'Encerrar aula' : 'Sair da aula'}
      </button>
    </div>
  );
}
