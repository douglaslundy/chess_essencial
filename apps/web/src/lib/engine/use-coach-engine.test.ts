// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { EngineEvaluation } from './browser-engine';

const evaluatePosition = vi.hoisted(() => vi.fn());
vi.mock('./browser-engine', () => ({ evaluatePosition }));

const { useCoachEngine } = await import('./use-coach-engine');

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function evaluation(overrides: Partial<EngineEvaluation> = {}): EngineEvaluation {
  return {
    bestMove: 'e2e4',
    mate: null,
    principalVariation: ['e2e4', 'e7e5'],
    scoreCp: 20,
    ...overrides,
  };
}

describe('useCoachEngine', () => {
  it('does nothing when disabled', () => {
    const { result } = renderHook(() =>
      useCoachEngine({ enabled: false, fen: START_FEN, suggestEnabled: true }),
    );
    expect(result.current.suggestion).toBeNull();
    expect(evaluatePosition).not.toHaveBeenCalled();
  });

  it('evaluates the position and exposes a suggestion when suggestEnabled', async () => {
    evaluatePosition
      .mockReset()
      .mockResolvedValueOnce(evaluation({ bestMove: 'e2e4', scoreCp: 25 }));

    const { result } = renderHook(() =>
      useCoachEngine({ enabled: true, fen: START_FEN, suggestEnabled: true }),
    );

    await waitFor(() => expect(result.current.suggestion).not.toBeNull());
    expect(result.current.suggestion).toEqual({
      bestMoveUci: 'e2e4',
      mate: null,
      principalVariation: ['e2e4', 'e7e5'],
      scoreCp: 25,
    });
  });

  it('evaluates but hides the suggestion when suggestEnabled is off', async () => {
    evaluatePosition.mockReset().mockResolvedValueOnce(evaluation());

    const { result } = renderHook(() =>
      useCoachEngine({ enabled: true, fen: START_FEN, suggestEnabled: false }),
    );

    await waitFor(() => expect(evaluatePosition).toHaveBeenCalledTimes(1));
    expect(result.current.suggestion).toBeNull();
  });

  it('grades a candidate move by negating the resulting-position evaluation', async () => {
    evaluatePosition
      .mockReset()
      .mockResolvedValueOnce(evaluation({ bestMove: 'e2e4', scoreCp: 20 })) // "before", white to move
      .mockResolvedValueOnce(evaluation({ bestMove: 'e7e5', scoreCp: -15 })); // "after", black to move

    const { result } = renderHook(() =>
      useCoachEngine({ enabled: true, fen: START_FEN, suggestEnabled: false }),
    );
    await waitFor(() => expect(evaluatePosition).toHaveBeenCalledTimes(1));

    let quality: Awaited<ReturnType<typeof result.current.checkCandidateMove>> = null;
    await act(async () => {
      quality = await result.current.checkCandidateMove('e2e4');
    });

    // before=20 (white), after=-(-15)=15 (white) → 5cp loss, still otimo.
    expect(quality).toMatchObject({ centipawnLoss: 5, quality: 'otimo' });
  });

  it('returns null for an illegal candidate move instead of throwing', async () => {
    evaluatePosition.mockReset().mockResolvedValueOnce(evaluation());
    const { result } = renderHook(() =>
      useCoachEngine({ enabled: true, fen: START_FEN, suggestEnabled: false }),
    );
    await waitFor(() => expect(evaluatePosition).toHaveBeenCalledTimes(1));

    let quality: Awaited<ReturnType<typeof result.current.checkCandidateMove>> = null;
    await act(async () => {
      quality = await result.current.checkCandidateMove('e2e5');
    });
    expect(quality).toBeNull();
  });
});
