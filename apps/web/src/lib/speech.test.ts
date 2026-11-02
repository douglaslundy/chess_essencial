// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const generateAiSpeech = vi.hoisted(() => vi.fn());
vi.mock('./api/client', () => ({ api: { generateAiSpeech } }));

interface FakeSynth {
  addEventListener: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  getVoices: ReturnType<typeof vi.fn>;
  pending: boolean;
  removeEventListener: ReturnType<typeof vi.fn>;
  speak: ReturnType<typeof vi.fn>;
  speaking: boolean;
}

function installFakeSynth(
  voicesAvailable: boolean,
  voices: Array<{ lang: string; name: string }> = [{ lang: 'pt-BR', name: 'Default' }],
): FakeSynth {
  const synth: FakeSynth = {
    addEventListener: vi.fn(),
    cancel: vi.fn(),
    getVoices: vi.fn(() => (voicesAvailable ? voices : [])),
    pending: false,
    removeEventListener: vi.fn(),
    speak: vi.fn(),
    speaking: false,
  };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
  (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class {
    addEventListener = vi.fn();
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
    generateAiSpeech.mockReset();
    localStorage.clear();
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('queues the new utterance without cancelling speech already in progress', async () => {
    const synth = installFakeSynth(true);
    synth.speaking = true;
    const { speak } = await import('./speech');

    await speak('Gafe, cuidado');

    expect(synth.cancel).not.toHaveBeenCalled();
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });

  it('only cancels ongoing narration when interruption is explicitly requested', async () => {
    const synth = installFakeSynth(true);
    const { speak } = await import('./speech');

    await speak('Nova prévia', { interrupt: true });

    expect(synth.cancel).toHaveBeenCalledTimes(1);
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });

  it('speaks one utterance per sentence and reports the end of the last one only', async () => {
    const synth = installFakeSynth(true);
    const { speak } = await import('./speech');
    const onEnd = vi.fn();

    await speak('Primeira frase. Segunda frase!', { onEnd });

    const utterances = synth.speak.mock.calls.map(
      (call) => call[0] as { addEventListener: ReturnType<typeof vi.fn>; text: string },
    );
    expect(utterances.map((utterance) => utterance.text)).toEqual([
      'Primeira frase.',
      'Segunda frase!',
    ]);
    const fireEnd = (utterance: (typeof utterances)[number]) =>
      utterance.addEventListener.mock.calls
        .filter(([type]) => type === 'end')
        .forEach(([, handler]) => (handler as () => void)());
    fireEnd(utterances[0]!);
    expect(onEnd).not.toHaveBeenCalled();
    fireEnd(utterances[1]!);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('does not report the end of speech cut by stopSpeaking', async () => {
    const synth = installFakeSynth(true);
    const { speak, stopSpeaking } = await import('./speech');
    const onEnd = vi.fn();

    await speak('Frase cortada.', { onEnd });
    stopSpeaking();
    const utterance = synth.speak.mock.calls[0]?.[0] as {
      addEventListener: ReturnType<typeof vi.fn>;
    };
    utterance.addEventListener.mock.calls
      .filter(([type]) => type === 'end')
      .forEach(([, handler]) => (handler as () => void)());

    expect(onEnd).not.toHaveBeenCalled();
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

  it('uses the requested voice by name when it exists', async () => {
    const synth = installFakeSynth(true, [
      { lang: 'pt-BR', name: 'Camila' },
      { lang: 'pt-BR', name: 'Daniel' },
    ]);
    const { speak } = await import('./speech');

    await speak('Eu sugiro e2 → e4', { voiceName: 'Daniel' });

    expect(synth.speak.mock.calls[0]?.[0]).toMatchObject({ voice: { name: 'Daniel' } });
  });

  it('falls back to the default voice when the requested name is unavailable', async () => {
    const synth = installFakeSynth(true, [{ lang: 'pt-BR', name: 'Camila' }]);
    const { speak } = await import('./speech');

    await speak('texto', { voiceName: 'Voz Inexistente' });

    expect(synth.speak.mock.calls[0]?.[0]).not.toHaveProperty('voice');
  });

  it('plays audio returned by OpenAI without using the system voice', async () => {
    const synth = installFakeSynth(true);
    localStorage.setItem('xadrez.access_token', 'token');
    generateAiSpeech.mockResolvedValue(new Blob(['mp3'], { type: 'audio/mpeg' }));
    const play = vi.fn();
    class FakeAudio {
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      pause = vi.fn();
      src = '';
      play = () => {
        play(this.src);
        queueMicrotask(() => this.onended?.());
        return Promise.resolve();
      };
    }
    vi.stubGlobal('Audio', FakeAudio);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:openai');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const { speak } = await import('./speech');

    await speak('Olá', { voiceName: 'openai:marin' });

    expect(generateAiSpeech).toHaveBeenCalledWith({ text: 'Olá', voice: 'openai:marin' }, 'token');
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith('blob:openai');
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('plays a prefetched AI clip without asking the server again', async () => {
    installFakeSynth(true);
    localStorage.setItem('xadrez.access_token', 'token');
    generateAiSpeech.mockResolvedValue(new Blob(['mp3'], { type: 'audio/mpeg' }));
    class FakeAudio {
      onended: (() => void) | null = null;
      pause = vi.fn();
      src = '';
      play = () => {
        queueMicrotask(() => this.onended?.());
        return Promise.resolve();
      };
    }
    vi.stubGlobal('Audio', FakeAudio);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:openai');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const { prefetchSpeech, speak } = await import('./speech');

    prefetchSpeech(['Primeiro passo.', 'Segundo passo.'], 'openai:marin');
    await vi.advanceTimersByTimeAsync(0);
    await speak('Segundo passo.', { voiceName: 'openai:marin' });

    expect(generateAiSpeech).toHaveBeenCalledTimes(2);
    expect(generateAiSpeech.mock.calls.map((call) => call[0].text)).toEqual([
      'Primeiro passo.',
      'Segundo passo.',
    ]);
  });

  it('unlocks one shared audio element on the first tap and reuses it for AI clips (iOS)', async () => {
    installFakeSynth(true);
    localStorage.setItem('xadrez.access_token', 'token');
    generateAiSpeech.mockResolvedValue(new Blob(['mp3'], { type: 'audio/mpeg' }));
    // Listeners from earlier imports of the module also fire, so track sources per element.
    const instances: Array<{ played: string[] }> = [];
    class FakeAudio {
      onended: (() => void) | null = null;
      played: string[] = [];
      src = '';
      constructor() {
        instances.push(this);
      }
      pause = vi.fn();
      play = () => {
        this.played.push(this.src.slice(0, 14));
        queueMicrotask(() => this.onended?.());
        return Promise.resolve();
      };
    }
    vi.stubGlobal('Audio', FakeAudio);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:openai');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const { speak } = await import('./speech');

    window.dispatchEvent(new Event('pointerdown'));
    await speak('Olá', { voiceName: 'openai:marin' });

    const aiElement = instances.find((item) => item.played.includes('blob:openai'));
    expect(aiElement?.played).toEqual(['data:audio/wav', 'blob:openai']);
  });

  it('reports an OpenAI failure and never falls back to the system voice', async () => {
    const synth = installFakeSynth(true);
    localStorage.setItem('xadrez.access_token', 'token');
    generateAiSpeech.mockRejectedValue(new Error('serviço indisponível'));
    const { speak } = await import('./speech');

    await expect(speak('Olá', { voiceName: 'openai:cedar' })).rejects.toThrow(
      'Não foi possível gerar a voz por IA da OpenAI: serviço indisponível',
    );
    expect(synth.speak).not.toHaveBeenCalled();
  });
});

describe('getAvailableVoices', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, 'speechSynthesis');
  });

  it('returns [] when the Web Speech API is unavailable', async () => {
    const { getAvailableVoices } = await import('./speech');
    await expect(getAvailableVoices()).resolves.toEqual([]);
  });

  it('waits for the voice list then returns it', async () => {
    const voices = [
      { lang: 'pt-BR', name: 'Camila' },
      { lang: 'pt-BR', name: 'Daniel' },
    ];
    const synth = installFakeSynth(false, voices);
    const { getAvailableVoices } = await import('./speech');

    const done = getAvailableVoices();
    expect(synth.addEventListener).toHaveBeenCalledWith('voiceschanged', expect.any(Function));
    const onVoicesChanged = synth.addEventListener.mock.calls[0]?.[1] as () => void;
    synth.getVoices.mockReturnValue(voices);
    onVoicesChanged();

    await expect(done).resolves.toEqual(voices);
  });
});
