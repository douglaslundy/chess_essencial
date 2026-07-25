// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeSynth {
  addEventListener: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  getVoices: ReturnType<typeof vi.fn>;
  pending: boolean;
  removeEventListener: ReturnType<typeof vi.fn>;
  speak: ReturnType<typeof vi.fn>;
  speaking: boolean;
}

function installFakeSynth(voicesAvailable: boolean): FakeSynth {
  const synth: FakeSynth = {
    addEventListener: vi.fn(),
    cancel: vi.fn(),
    getVoices: vi.fn(() => (voicesAvailable ? [{ lang: 'pt-BR' }] : [])),
    pending: false,
    removeEventListener: vi.fn(),
    speak: vi.fn(),
    speaking: false,
  };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
  (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class {
    lang = '';
    text: string;
    constructor(text: string) {
      this.text = text;
    }
  };
  return synth;
}

describe('speak', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, 'speechSynthesis');
  });

  it('speaks immediately when voices are already loaded and nothing is playing', async () => {
    const synth = installFakeSynth(true);
    const { speak } = await import('./speech');

    await speak('Ótimo lance');

    expect(synth.cancel).not.toHaveBeenCalled();
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(synth.speak.mock.calls[0]?.[0]).toMatchObject({ lang: 'pt-BR', text: 'Ótimo lance' });
  });

  it('waits for the async voice list before speaking (the silent-drop bug this fixes)', async () => {
    const synth = installFakeSynth(false);
    const { speak } = await import('./speech');

    const done = speak('Cuidado, isso é uma gafe');
    // Voices aren't ready yet — nothing should have been spoken synchronously.
    expect(synth.speak).not.toHaveBeenCalled();
    expect(synth.addEventListener).toHaveBeenCalledWith('voiceschanged', expect.any(Function));

    const onVoicesChanged = synth.addEventListener.mock.calls[0]?.[1] as () => void;
    onVoicesChanged();
    await done;

    expect(synth.speak).toHaveBeenCalledTimes(1);
  });

  it('falls back to speaking even if voiceschanged never fires', async () => {
    installFakeSynth(false);
    const { speak } = await import('./speech');

    const done = speak('sem evento de vozes');
    await vi.advanceTimersByTimeAsync(1000);
    await done;

    const synth = window.speechSynthesis as unknown as FakeSynth;
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });

  it('cancels and defers the new utterance when one is already speaking', async () => {
    const synth = installFakeSynth(true);
    synth.speaking = true;
    const { speak } = await import('./speech');

    const done = speak('Gafe, cuidado');
    await Promise.resolve();
    expect(synth.cancel).toHaveBeenCalledTimes(1);
    expect(synth.speak).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(50);
    await done;
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the Web Speech API is unavailable', async () => {
    Reflect.deleteProperty(window, 'speechSynthesis');
    const { speak } = await import('./speech');
    await expect(speak('sem suporte')).resolves.toBeUndefined();
  });

  it('stopSpeaking cancels any ongoing speech', async () => {
    const synth = installFakeSynth(true);
    const { stopSpeaking } = await import('./speech');

    stopSpeaking();

    expect(synth.cancel).toHaveBeenCalledTimes(1);
  });
});
