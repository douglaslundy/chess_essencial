// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { markGameWatched, readWatchedGames } from './watched-games';

afterEach(() => window.localStorage.clear());

describe('watched library games', () => {
  it('remembers each watched game once', () => {
    markGameWatched('a');
    markGameWatched('b');
    markGameWatched('a');
    expect([...readWatchedGames()].sort()).toEqual(['a', 'b']);
  });

  it('ignores corrupted storage', () => {
    window.localStorage.setItem('xadrez.library_watched.anon', '{oops');
    expect(readWatchedGames().size).toBe(0);
  });
});
