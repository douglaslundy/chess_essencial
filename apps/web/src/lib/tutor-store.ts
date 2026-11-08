import { useEffect, useSyncExternalStore } from 'react';

import { setTutorActive as blockVoice } from './speech';

export type TutorContentKind = 'library' | 'exercise' | 'review' | 'lesson';

/** The content the teacher has open: what the AI tutor can turn into a frame-by-frame lesson. */
export interface TutorContent {
  contentId: string;
  kind: TutorContentKind;
  /** Course lessons only: what each step says (their texts live in the web app). */
  steps?: Array<{ say: string }>;
}

interface TutorState {
  active: boolean;
  content: TutorContent | null;
  /** Frame shown now: the ply of a game, the step of a lesson (0 = overview). */
  frame: number;
}

let state: TutorState = { active: false, content: null, frame: 0 };
const listeners = new Set<() => void>();

function update(next: Partial<TutorState>) {
  state = { ...state, ...next };
  if (next.active !== undefined) blockVoice(next.active);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getState = () => state;
const getServerState = (): TutorState => ({ active: false, content: null, frame: 0 });

export function useTutorState(): TutorState {
  return useSyncExternalStore(subscribe, getState, getServerState);
}

/** True while the AI tutor is on: the page then skips its own review commentary. */
export function useTutorActive(): boolean {
  return useTutorState().active;
}

export function setTutorActive(active: boolean) {
  update({ active });
}

/**
 * Registers the content a page shows (null: nothing the tutor can teach) and its current frame.
 * Leaving the page clears it and turns the tutor off.
 */
export function useTutorContent(content: TutorContent | null, frame: number) {
  const key = content ? `${content.kind}:${content.contentId}` : '';
  useEffect(() => {
    if (!content) return;
    update({ active: false, content, frame: 0 });
    return () => update({ active: false, content: null, frame: 0 });
    // The content object is rebuilt on every render; its key identifies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (key) update({ frame });
  }, [frame, key]);
}
