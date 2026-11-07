/**
 * Which study items (exercises and library games) the student finished. Kept in this browser,
 * per user, so it needs no database change; clearing site data resets the checkmarks.
 */
export type StudyKind = 'exercise' | 'game';

const key = (userId: string | null, kind: StudyKind) => `xadrez.study.${userId ?? 'anon'}.${kind}`;

export function readStudyDone(userId: string | null, kind: StudyKind): Set<string> {
  try {
    const raw = window.localStorage.getItem(key(userId, kind));
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(
      Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [],
    );
  } catch {
    return new Set();
  }
}

export function markStudyDone(userId: string | null, kind: StudyKind, id: string): Set<string> {
  const done = readStudyDone(userId, kind);
  done.add(id);
  try {
    window.localStorage.setItem(key(userId, kind), JSON.stringify([...done].slice(-500)));
  } catch {
    // Storage blocked: the checkmark just lasts until the page is closed.
  }
  return done;
}
