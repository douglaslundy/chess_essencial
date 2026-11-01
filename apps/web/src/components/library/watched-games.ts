import { getStoredUserId } from '@/lib/api/client';

// shortcut: kept in this browser only (no migration while the offsite backup is not configured);
// move to the API when "assistidas" must follow the user across devices.
const MAX_ENTRIES = 2000;

function storageKey(): string {
  return `xadrez.library_watched.${getStoredUserId() ?? 'anon'}`;
}

export function readWatchedGames(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey()) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

export function markGameWatched(gameId: string): void {
  try {
    const ids = [...readWatchedGames()].filter((id) => id !== gameId);
    ids.push(gameId);
    window.localStorage.setItem(storageKey(), JSON.stringify(ids.slice(-MAX_ENTRIES)));
  } catch {
    // Storage blocked: the game simply stays unmarked.
  }
}
