'use client';

import { classifyMove, type MoveQualityResult } from '@xadrez/chess-domain';
import { Chess } from 'chess.js';
import { useEffect, useState } from 'react';

import { evaluatePosition } from './browser-engine';

const REVIEW_DEPTH = 10;

export interface OpponentReview {
  bestMoveUci: string | null;
  ply: number;
  quality: MoveQualityResult;
}

interface PlayedMove {
  fenBefore: string;
  ply: number;
  uci: string;
}

/**
 * Grades the move the Treinador (the opponent) just played with the browser engine, the same way
 * the player's own candidate moves are graded, so it can be narrated and evaluated too.
 */
export function useOpponentReview(options: {
  enabled: boolean;
  move: PlayedMove | null;
}): OpponentReview | null {
  const { enabled, move } = options;
  const [review, setReview] = useState<OpponentReview | null>(null);
  const ply = move?.ply ?? null;
  const fenBefore = move?.fenBefore ?? null;
  const uci = move?.uci ?? null;

  useEffect(() => {
    if (!enabled || ply === null || fenBefore === null || uci === null) return;
    let cancelled = false;
    async function grade() {
      const chess = new Chess(fenBefore!);
      chess.move({
        from: uci!.slice(0, 2),
        to: uci!.slice(2, 4),
        ...(uci!.length > 4 ? { promotion: uci!.slice(4) } : {}),
      });
      const before = await evaluatePosition(fenBefore!, { depth: REVIEW_DEPTH });
      const after = await evaluatePosition(chess.fen(), { depth: REVIEW_DEPTH });
      if (cancelled) return;
      setReview({
        bestMoveUci: before.bestMove,
        ply: ply!,
        quality: classifyMove({
          mateAfter: after.mate === null ? null : -after.mate,
          mateBefore: before.mate,
          scoreAfterCp: after.scoreCp === null ? null : -after.scoreCp,
          scoreBeforeCp: before.scoreCp,
        }),
      });
    }
    grade().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled, ply, fenBefore, uci]);

  return enabled && review?.ply === ply ? review : null;
}
