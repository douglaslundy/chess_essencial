// Web Speech API wrapper with fixes for three long-standing browser quirks:
// (1) the voice list loads asynchronously (getVoices() returns [] until the
//     browser fires 'voiceschanged'), and calling speak() before that is
//     silently dropped on some Chromium versions — no error, just no
//     audio, which is exactly what looks like "nothing happens"; (2) some
//     engines silently drop an utterance queued right after cancel() in the
//     same tick, so a pending cancel gets a short delay before the next
//     speak(); (3) a SpeechSynthesisUtterance with no surviving reference
//     can get garbage-collected mid-speech, cutting audio off — keeping one
//     module-level reference prevents that.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept alive on purpose, see above
let currentUtterance: SpeechSynthesisUtterance | null = null;
let currentAudio: HTMLAudioElement | null = null;
let currentAudioUrl: string | null = null;
let voicesReady: Promise<void> | null = null;

function ensureVoicesLoaded(synth: SpeechSynthesis): Promise<void> {
  if (synth.getVoices().length > 0) return Promise.resolve();
  voicesReady ??= new Promise((resolve) => {
    const onVoicesChanged = () => {
      synth.removeEventListener('voiceschanged', onVoicesChanged);
      resolve();
    };
    synth.addEventListener('voiceschanged', onVoicesChanged);
    // Some platforms never fire voiceschanged at all — don't block forever.
    setTimeout(resolve, 1000);
  });
  return voicesReady;
}

/** Every voice the browser/OS currently offers, waiting first for the async voice list to finish loading. */
export async function getAvailableVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  const synth = window.speechSynthesis;
  await ensureVoicesLoaded(synth);
  return synth.getVoices();
}

export interface SpeakOptions {
  lang?: string;
  /** SpeechSynthesisVoice.name of a preferred voice; falls back to the browser default if not found. */
  voiceName?: string | null;
}

async function speakWithAi(text: string, voiceName: string): Promise<boolean> {
  const token = window.localStorage.getItem('xadrez.access_token');
  if (!token) return false;
  try {
    const { api } = await import('./api/client');
    const blob = await api.generateAiSpeech(
      { text, voice: voiceName as 'openai:marin' | 'openai:cedar' },
      token,
    );
    if (currentAudio) currentAudio.pause();
    if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = URL.createObjectURL(blob);
    const audio = new Audio(currentAudioUrl);
    currentAudio = audio;
    audio.addEventListener(
      'ended',
      () => {
        if (currentAudio === audio) currentAudio = null;
        if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
        currentAudioUrl = null;
      },
      { once: true },
    );
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

export async function speak(text: string, options: SpeakOptions = {}): Promise<void> {
  if (typeof window === 'undefined') return;
  if (options.voiceName?.startsWith('openai:')) {
    if (await speakWithAi(text, options.voiceName)) return;
  }
  if (!('speechSynthesis' in window)) return;
  const synth = window.speechSynthesis;
  await ensureVoicesLoaded(synth);

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = options.lang ?? 'pt-BR';
  if (options.voiceName) {
    const voice = synth.getVoices().find((candidate) => candidate.name === options.voiceName);
    if (voice) utterance.voice = voice;
  }
  currentUtterance = utterance;
  if (synth.speaking || synth.pending) {
    synth.cancel();
    setTimeout(() => synth.speak(utterance), 50);
  } else {
    synth.speak(utterance);
  }
}

export function stopSpeaking(): void {
  if (typeof window === 'undefined') return;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  currentUtterance = null;
  if (currentAudio) currentAudio.pause();
  currentAudio = null;
  if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
  currentAudioUrl = null;
}
