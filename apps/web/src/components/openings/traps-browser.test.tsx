// @vitest-environment jsdom
import type { OpeningLine } from '@xadrez/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { markGameWatched } from '@/components/library/watched-games';

import { TrapsBrowser } from './traps-browser';

const trap = (name: string, side: 'black' | 'white'): OpeningLine => ({
  eco: 'TRP',
  family: name,
  id: `00000000-0000-4000-8000-00000000000${side === 'white' ? 1 : 2}`,
  moves: ['e4'],
  name,
  pgn: '1. e4',
  plyCount: 1,
  side,
  trapIdea: `Ideia de ${name}`,
});

const search = vi.fn();
vi.mock('@/lib/api/client', () => ({
  getStoredUserId: () => null,
  api: {
    listDueOpenings: () => Promise.resolve([]),
    searchOpenings: (...args: unknown[]) => search(...args),
  },
}));

afterEach(() => cleanup());

describe('TrapsBrowser', () => {
  it('lists the traps of the chosen side, with their idea', async () => {
    search.mockResolvedValue([trap('Armadilha Branca', 'white'), trap('Armadilha Preta', 'black')]);
    render(createElement(TrapsBrowser));
    expect(await screen.findByText('Armadilha Branca')).toBeTruthy();
    expect(screen.getByText('Ideia de Armadilha Branca')).toBeTruthy();
    expect(screen.queryByText('Armadilha Preta')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Com as pretas' }));
    await waitFor(() => expect(screen.getByText('Armadilha Preta')).toBeTruthy());
    expect(search).toHaveBeenCalledWith({ kind: 'trap', q: undefined }, expect.any(String));
  });

  it('marks the traps the student already watched', async () => {
    window.localStorage.clear();
    markGameWatched('00000000-0000-4000-8000-000000000001');
    search.mockResolvedValue([trap('Armadilha Branca', 'white')]);
    render(createElement(TrapsBrowser));
    expect(await screen.findByText('✓ Assistida')).toBeTruthy();
  });
});
