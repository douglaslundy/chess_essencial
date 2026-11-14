'use client';

import type { PieceSymbol } from 'chess.js';
import { useEffect, useRef, useState } from 'react';

import styles from './capture-video.module.css';
import type { PlayedMove } from '@/components/game/move-path';

const PIECE_PT: Record<PieceSymbol, string> = {
  b: 'Bispo',
  k: 'Rei',
  n: 'Cavalo',
  p: 'Peão',
  q: 'Dama',
  r: 'Torre',
};

/** One film per capture in `public/captures`: `<colour><capturing piece>x<captured piece>.mp4`. */
export function captureVideoSrc(move: Pick<PlayedMove, 'captured' | 'color' | 'piece'>) {
  return `/captures/${move.color}${move.piece}x${move.captured}.mp4`;
}

/** The capture is seen on the board first; the film starts after this. */
const START_DELAY_MS = 1000;
/** A film that has not started playing by then frees the board. */
const GIVE_UP_MS = 5000;

/**
 * Capture film over the board. It ends by itself or when the player taps it; the caller keeps
 * the board on the capture until `onClose`. Only the window takes clicks.
 */
export default function CaptureVideo({ move, onClose }: { move: PlayedMove; onClose: () => void }) {
  const [started, setStarted] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const start = window.setTimeout(() => {
      setStarted(true);
      const element = video.current;
      // Browsers refuse sound before the first tap on the page: play it silent then.
      element?.play().catch(() => {
        element.muted = true;
        element.play().catch(() => close.current());
      });
    }, START_DELAY_MS);
    const giveUp = window.setTimeout(() => {
      if (!video.current?.currentTime) close.current();
    }, GIVE_UP_MS);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(giveUp);
    };
  }, []);
  if (!move.captured) return null;
  const caption = `${PIECE_PT[move.piece]} captura ${PIECE_PT[move.captured].toLowerCase()}`;
  return (
    <div className={styles.overlay} hidden={!started}>
      <button
        aria-label={`${caption}. Pular vídeo`}
        className={styles.window}
        onClick={onClose}
        type="button"
      >
        <video
          onEnded={onClose}
          onError={onClose}
          playsInline
          preload="auto"
          ref={video}
          src={captureVideoSrc(move)}
        />
        <span className={styles.caption}>{caption} · toque aqui para pular</span>
      </button>
    </div>
  );
}
