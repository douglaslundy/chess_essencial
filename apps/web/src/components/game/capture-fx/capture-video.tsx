'use client';

import type { PieceSymbol } from 'chess.js';
import { useState } from 'react';

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

/** Capture film over the board. Only the window takes clicks (to skip); the game runs underneath. */
export default function CaptureVideo({ move }: { move: PlayedMove }) {
  const [visible, setVisible] = useState(true);
  if (!visible || !move.captured) return null;
  const close = () => setVisible(false);
  const caption = `${PIECE_PT[move.piece]} captura ${PIECE_PT[move.captured].toLowerCase()}`;
  return (
    <div className={styles.overlay}>
      <button
        aria-label={`${caption}. Pular vídeo`}
        className={styles.window}
        onClick={close}
        type="button"
      >
        <video
          autoPlay
          onEnded={close}
          onError={close}
          playsInline
          ref={(video) => {
            // Browsers refuse sound before the first tap on the page: play it silent then.
            video?.play().catch(() => {
              video.muted = true;
              video.play().catch(close);
            });
          }}
          src={captureVideoSrc(move)}
        />
        <span className={styles.caption}>{caption} · toque para pular</span>
      </button>
    </div>
  );
}
