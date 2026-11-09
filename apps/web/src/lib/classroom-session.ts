export interface ClassroomSession {
  id: string;
  name: string;
  role: 'teacher' | 'student';
}

const KEY = 'xadrez.classroom';
export const CLASSROOM_EVENT = 'xadrez:classroom';

/** The room this browser is teaching or following; kept in localStorage so it survives navigation. */
export function readClassroomSession(): ClassroomSession | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ClassroomSession>;
    if (
      typeof value.id === 'string' &&
      typeof value.name === 'string' &&
      (value.role === 'teacher' || value.role === 'student')
    ) {
      return { id: value.id, name: value.name, role: value.role };
    }
  } catch {
    // Storage blocked or corrupted: behave as if there is no active class.
  }
  return null;
}

export function writeClassroomSession(session: ClassroomSession | null) {
  try {
    if (session) window.localStorage.setItem(KEY, JSON.stringify(session));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Without storage the class banner simply won't persist across pages.
  }
  window.dispatchEvent(new Event(CLASSROOM_EVENT));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where a student is sent for the page the teacher is on. Pages the student cannot open for the
 * teacher's own data (their game, their exercise session) become read-only classroom views.
 */
export function studentPathFor(livePath: string): string {
  const url = new URL(livePath, 'http://classroom.local');
  const game = /^\/app\/partida\/([^/]+)$/.exec(url.pathname);
  if (game && UUID.test(game[1]!)) return `/app/sala/partida/${game[1]}`;
  if (url.pathname === '/app/treinamento') {
    const exercise = url.searchParams.get('cx');
    if (exercise && UUID.test(exercise)) {
      const moves = url.searchParams.get('cm');
      return `/app/sala/exercicio/${exercise}${moves ? `?m=${moves}` : ''}`;
    }
  }
  return livePath;
}

/** The teacher's shortcuts: one per area of the platform. */
export const CLASSROOM_AREAS = [
  { href: '/app/curso', label: 'Curso' },
  { href: '/app/treinamento', label: 'Treinamento' },
  { href: '/app/partidas', label: 'Partida' },
  { href: '/app/biblioteca', label: 'Biblioteca' },
  { href: '/app/aberturas', label: 'Aberturas' },
  { href: '/app/desafios', label: 'Desafio' },
  { href: '/app/jogar', label: 'Jogar' },
] as const;
