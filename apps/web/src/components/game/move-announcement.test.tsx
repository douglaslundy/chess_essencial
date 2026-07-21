// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { describeImportantMove, MoveAnnouncement } from './move-announcement';

describe('describeImportantMove', () => {
  it('prioritizes checkmate over everything else', () => {
    expect(
      describeImportantMove({
        san: 'Qh7#',
        to: 'h7',
        flags: { capture: true, castling: null, promotion: false },
      }),
    ).toEqual({ text: 'Xeque-mate!', tone: 'danger' });
  });

  it('reports check when not mate', () => {
    expect(
      describeImportantMove({
        san: 'Qh7+',
        to: 'h7',
        flags: { capture: false, castling: null, promotion: false },
      }),
    ).toEqual({ text: 'Xeque!', tone: 'danger' });
  });

  it('reports promotion', () => {
    expect(
      describeImportantMove({
        san: 'e8=Q',
        to: 'e8',
        flags: { capture: false, castling: null, promotion: true },
      }),
    ).toEqual({ text: 'Promoção! e8=Q', tone: 'success' });
  });

  it('reports castling', () => {
    expect(
      describeImportantMove({
        san: 'O-O',
        to: 'g1',
        flags: { capture: false, castling: 'king_side', promotion: false },
      }),
    ).toEqual({ text: 'Roque', tone: 'neutral' });
  });

  it('reports a capture', () => {
    expect(
      describeImportantMove({
        san: 'Nxe5',
        to: 'e5',
        flags: { capture: true, castling: null, promotion: false },
      }),
    ).toEqual({ text: 'Captura em e5', tone: 'neutral' });
  });

  it('returns null for a quiet move', () => {
    expect(
      describeImportantMove({
        san: 'e4',
        to: 'e4',
        flags: { capture: false, castling: null, promotion: false },
      }),
    ).toBeNull();
  });
});

describe('MoveAnnouncement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when there is no announcement', () => {
    render(createElement(MoveAnnouncement, { announcement: null }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows the announcement text and hides it after 2.5s', () => {
    render(
      createElement(MoveAnnouncement, {
        announcement: { text: 'Xeque!', tone: 'danger', key: 'move-1' },
      }),
    );
    expect(screen.getByRole('status').textContent).toBe('Xeque!');
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
