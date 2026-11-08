// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { isVoiceBlocked } from './speech';
import { setTutorActive, useTutorContent, useTutorState } from './tutor-store';

let seen: ReturnType<typeof useTutorState> | null = null;

function Page({ frame, id }: { frame: number; id: string | null }) {
  useTutorContent(id ? { contentId: id, kind: 'library' } : null, frame);
  const state = useTutorState();
  useEffect(() => {
    seen = state;
  });
  return null;
}

afterEach(() => {
  seen = null;
  localStorage.clear();
});

describe('tutor store', () => {
  it('follows the page content and frame, and clears them when the page closes', () => {
    const view = render(<Page frame={3} id="game-1" />);
    expect(seen).toMatchObject({ active: false, content: { contentId: 'game-1' }, frame: 3 });

    view.rerender(<Page frame={4} id="game-1" />);
    expect(seen?.frame).toBe(4);

    view.unmount();
    render(<Page frame={0} id={null} />);
    expect(seen?.content).toBeNull();
  });

  it('turns the voice off while the tutor is on', () => {
    expect(isVoiceBlocked()).toBe(false);
    act(() => setTutorActive(true));
    expect(isVoiceBlocked()).toBe(true);
    act(() => setTutorActive(false));
    expect(isVoiceBlocked()).toBe(false);
  });
});
