'use client';

import { useEffect, useState } from 'react';

import styles from './move-announcement.module.css';
import { toBrazilianSan } from '@/lib/notation';

export type AnnouncementTone = 'neutral' | 'success' | 'danger';

export interface Announcement {
  text: string;
  tone: AnnouncementTone;
  key: string;
}

const VISIBLE_DURATION_MS = 2500;

export function describeImportantMove(move: {
  san: string;
  to: string;
  flags: { capture: boolean; castling: 'king_side' | 'queen_side' | null; promotion: boolean };
}): { text: string; tone: AnnouncementTone } | null {
  if (move.san.includes('#')) return { text: 'Xeque-mate!', tone: 'danger' };
  if (move.san.includes('+')) return { text: 'Xeque!', tone: 'danger' };
  if (move.flags.promotion)
    return { text: `Promoção! ${toBrazilianSan(move.san)}`, tone: 'success' };
  if (move.flags.castling) return { text: 'Roque', tone: 'neutral' };
  if (move.flags.capture) return { text: `Captura em ${move.to}`, tone: 'neutral' };
  return null;
}

export function MoveAnnouncement({ announcement }: { announcement: Announcement | null }) {
  const [visible, setVisible] = useState<Announcement | null>(null);

  useEffect(() => {
    if (!announcement) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(announcement);
    const timer = setTimeout(() => setVisible(null), VISIBLE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [announcement]);

  if (!visible) return null;

  return (
    <div
      aria-live="polite"
      className={`${styles.balloon} ${styles[visible.tone]}`}
      key={visible.key}
      role="status"
    >
      {visible.text}
    </div>
  );
}
