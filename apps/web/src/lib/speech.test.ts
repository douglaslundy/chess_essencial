// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { speak, stopSpeaking } from './speech';

describe('speak', () => {
  let synth: {
    cancel: ReturnType<typeof vi.fn>;
    pending: boolean;
    speak: ReturnType<typeof vi.fn>;
    speaking: boolean;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    synth = { cancel: vi.fn(), pending: false, speak: vi.fn(), speaking: false };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class {
      lang = '';
      text: string;
      constructor(text: string) {
        this.text = text;
      }
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, 'speechSynthesis');
  });

  it('speaks immediately when nothing is currently playing', () => {
    speak('Ótimo lance');
    expect(synth.cancel).not.toHaveBeenCalled();
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(synth.speak.mock.calls[0]?.[0]).toMatchObject({ lang: 'pt-BR', text: 'Ótimo lance' });
  });

  it('cancels and defers the new utterance when one is already speaking', () => {
    synth.speaking = true;
    speak('Gafe, cuidado');
    expect(synth.cancel).toHaveBeenCalledTimes(1);
    expect(synth.speak).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the Web Speech API is unavailable', () => {
    Reflect.deleteProperty(window, 'speechSynthesis');
    expect(() => speak('sem suporte')).not.toThrow();
  });

  it('stopSpeaking cancels any ongoing speech', () => {
    stopSpeaking();
    expect(synth.cancel).toHaveBeenCalledTimes(1);
  });
});
