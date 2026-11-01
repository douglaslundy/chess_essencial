'use client';

import { useState } from 'react';

import { splitCoachText } from './coach-text';

interface CoachCalloutProps {
  label?: string;
  message: string;
}

/**
 * Fixed-height balloon (two lines): a longer comment opens over the page with "ver mais" instead of
 * growing, so the board below never moves.
 */
export function CoachCallout({ label = 'Treinador', message }: CoachCalloutProps) {
  // Expansion belongs to one message: a new comment opens compact again.
  const [expandedMessage, setExpandedMessage] = useState<string | null>(null);
  const expanded = expandedMessage === message;
  const { lead, rest } = splitCoachText(message);
  return (
    <aside className="coachCallout" data-expanded={expanded || undefined} role="status">
      <span aria-hidden="true" className="coachAvatar">
        ♞
      </span>
      <div className="coachSpeechBubble">
        <p>
          <strong>{label}</strong> {expanded || !rest ? message : lead}
        </p>
        {rest ? (
          <button
            aria-expanded={expanded}
            className="coachMoreButton"
            onClick={() => setExpandedMessage(expanded ? null : message)}
            type="button"
          >
            {expanded ? 'ver menos' : 'ver mais'}
          </button>
        ) : null}
      </div>
    </aside>
  );
}
