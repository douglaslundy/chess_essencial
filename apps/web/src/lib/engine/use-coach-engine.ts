'use client';

import { classifyMove, type MoveQualityResult } from '@xadrez/chess-domain';
import { Chess } from 'chess.js';
import { useEffect, useRef, useState } from 'react';

import { evaluatePosition } from './browser-engine';

const SUGGESTION_DEPTH = 10;

export interface CoachSuggestion {
  bestMoveUci: string | null;
  mate: number | null;
  principalVariation: string[];
  scoreCp: number | null;
}

interface CachedEvaluation {
  fen: string;
  mate: number | null;
  scoreCp: number | null;
}

/**
 * Drives the Treinador's client-side engine checks for the position where
 * it's currently the player's turn: caches one "before" evaluation (reused
 * both for the optional move suggestion and for grading whichever move the
 * player ends up attempting), and exposes checkCandidateMove to grade a
 * candidate move before it's actually sent to the server.
 */
export function useCoachEngine(options: {
  enabled: boolean;
  fen: string;
  suggestEnabled: boolean;
}) {
  const { enabled, fen, suggestEnabled } = options;
  const [evaluated, setSuggestion] = useState<(CoachSuggestion & { fen: string }) | null>(null);
  // Until the new position is evaluated the previous tip is stale: never hand it out.
  const suggestion: CoachSuggestion | null = evaluated?.fen === fen ? evaluated : null;
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const beforeRef = useRef<CachedEvaluation | null>(null);

  useEffect(() => {
    if (!enabled) {
      beforeRef.current = null;
      queueMicrotask(() => setSuggestion(null));
      return;
    }
    let cancelled = false;
    queueMicrotask(() => setLoading(true));
    evaluatePosition(fen, { depth: SUGGESTION_DEPTH })
      .then((evaluation) => {
        if (cancelled) return;
        beforeRef.current = { fen, mate: evaluation.mate, scoreCp: evaluation.scoreCp };
        setFailed(false);
        setSuggestion(
          suggestEnabled
            ? {
                bestMoveUci: evaluation.bestMove,
                fen,
                mate: evaluation.mate,
                principalVariation: evaluation.principalVariation.slice(0, 7),
                scoreCp: evaluation.scoreCp,
              }
            : null,
        );
      })
      .catch(() => {
        if (cancelled) return;
        setSuggestion(null);
        setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, fen, suggestEnabled]);

  async function checkCandidateMove(uci: string): Promise<MoveQualityResult | null> {
    const before = beforeRef.current;
    if (!enabled || !before || before.fen !== fen) return null;

    let fenAfter: string;
    try {
      const chess = new Chess(fen);
      const promotion = uci.length > 4 ? uci.slice(4) : undefined;
      chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        ...(promotion ? { promotion } : {}),
      });
      fenAfter = chess.fen();
    } catch {
      return null;
    }

    const after = await evaluatePosition(fenAfter, { depth: SUGGESTION_DEPTH });
    return classifyMove({
      mateAfter: after.mate === null ? null : -after.mate,
      mateBefore: before.mate,
      scoreAfterCp: after.scoreCp === null ? null : -after.scoreCp,
      scoreBeforeCp: before.scoreCp,
    });
  }

  return { checkCandidateMove, failed, loading, suggestion };
}
