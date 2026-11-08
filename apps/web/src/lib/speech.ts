// Speech queue shared by browser and AI-generated voices. New coaching messages
// are queued by default, so a position update or opponent reply never cuts the
// sentence currently being played. stopSpeaking() is the explicit cancellation
// boundary used when narration is muted, the screen is left, or a preview asks
// to interrupt.
import { isSoundMuted } from './sound';

const activeUtterances = new Set<SpeechSynthesisUtterance>();
let currentAudio: HTMLAudioElement | null = null;
let currentAudioUrl: string | null = null;
let voicesReady: Promise<void> | null = null;
let audioQueue: Promise<void> = Promise.resolve();
let queueGeneration = 0;

let sharedAudio: HTMLAudioElement | null = null;
// 2 samples of 8-bit silence: playing it inside the first tap unlocks the shared element.
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQIAAACAgA==';

// iOS only plays media started from a tap. One audio element, played silently on the first
// tap, is reused for every AI voice clip (a fresh Audio() after a fetch would be blocked).
function audioElement(): HTMLAudioElement {
  sharedAudio ??= new Audio();
  return sharedAudio;
}

// iOS only starts speech from a tap; an empty utterance on the first tap unlocks later narration.
if (typeof window !== 'undefined') {
  const unlock = () => {
    window.removeEventListener('pointerdown', unlock);
    if ('speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    if (typeof Audio !== 'undefined') {
      const audio = audioElement();
      audio.src = SILENT_WAV;
      audio.play().catch(() => undefined);
    }
  };
  window.addEventListener('pointerdown', unlock);
}

let tutorActive = false;

/** The classroom AI tutor replaces the voice: while it is on, no narration is played or generated. */
export function setTutorActive(active: boolean): void {
  tutorActive = active;
  if (active) stopSpeaking();
}

/** Single rule for the whole platform: sound off or tutor on => no voice is generated or played. */
export function isVoiceBlocked(): boolean {
  return tutorActive || isSoundMuted();
}

export const NARRATION_RATES = [1, 1.2, 1.5, 2] as const;
const RATE_KEY = 'xadrez.narration_rate';

/** Narration speed chosen in the board settings, saved on this device. */
export function getNarrationRate(): number {
  if (typeof window === 'undefined') return 1;
  try {
    const rate = Number(window.localStorage.getItem(RATE_KEY));
    return (NARRATION_RATES as readonly number[]).includes(rate) ? rate : 1;
  } catch {
    return 1;
  }
}

export function setNarrationRate(rate: number): void {
  try {
    window.localStorage.setItem(RATE_KEY, String(rate));
  } catch {
    // Storage blocked: the speed lasts only for this page.
  }
}

function ensureVoicesLoaded(synth: SpeechSynthesis): Promise<void> {
  if (synth.getVoices().length > 0) return Promise.resolve();
  voicesReady ??= new Promise((resolve) => {
    const onVoicesChanged = () => {
      synth.removeEventListener('voiceschanged', onVoicesChanged);
      resolve();
    };
    synth.addEventListener('voiceschanged', onVoicesChanged);
    setTimeout(resolve, 1000);
  });
  return voicesReady;
}

export async function getAvailableVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  const synth = window.speechSynthesis;
  await ensureVoicesLoaded(synth);
  return synth.getVoices();
}

export interface SpeakOptions {
  /** Cancels queued and ongoing narration before playing this message. */
  interrupt?: boolean;
  lang?: string;
  /** Called when the message finished playing (not when it was cut by stopSpeaking). */
  onEnd?: () => void;
  /** SpeechSynthesisVoice.name or an AI voice id. */
  voiceName?: string | null;
}

function cleanupAudio(audio: HTMLAudioElement, url: string): void {
  if (currentAudio === audio) currentAudio = null;
  if (currentAudioUrl === url) currentAudioUrl = null;
  URL.revokeObjectURL(url);
}

// AI clips fetched or being fetched, by voice + text: a prefetched clip plays without waiting
// for the server to generate it. Small (a few KB each) and capped.
const clipCache = new Map<string, Promise<Blob>>();
const CLIP_CACHE_MAX = 60;

function fetchClip(text: string, voiceName: string, token: string): Promise<Blob> {
  const key = `${voiceName}|${text}`;
  const cached = clipCache.get(key);
  if (cached) return cached;
  const clip = import('./api/client').then(({ api }) =>
    api.generateAiSpeech({ text, voice: voiceName as 'openai:marin' | 'openai:cedar' }, token),
  );
  clip.catch(() => clipCache.delete(key));
  clipCache.set(key, clip);
  if (clipCache.size > CLIP_CACHE_MAX) clipCache.delete(clipCache.keys().next().value!);
  return clip;
}

/**
 * Generates AI voice clips ahead of time, one after another in the given order, so narration
 * starts at once when they are spoken. Does nothing for browser voices.
 */
export function prefetchSpeech(texts: string[], voiceName: string | null | undefined): void {
  if (typeof window === 'undefined' || isVoiceBlocked() || !voiceName?.startsWith('openai:'))
    return;
  const token = window.localStorage.getItem('xadrez.access_token');
  if (!token) return;
  void texts.reduce<Promise<unknown>>(
    (chain, text) => chain.then(() => fetchClip(text, voiceName, token).catch(() => undefined)),
    Promise.resolve(),
  );
}

async function speakWithAi(text: string, voiceName: string, generation: number): Promise<void> {
  const token = window.localStorage.getItem('xadrez.access_token');
  if (!token) {
    throw new Error('Entre na sua conta para usar a voz por IA da OpenAI.');
  }

  let audio: HTMLAudioElement | null = null;
  let url: string | null = null;
  try {
    const blob = await fetchClip(text, voiceName, token);
    if (generation !== queueGeneration) return;
    url = URL.createObjectURL(blob);
    audio = audioElement();
    audio.src = url;
    // A new src resets playbackRate to defaultPlaybackRate, so both are set.
    audio.defaultPlaybackRate = audio.playbackRate = getNarrationRate();
    currentAudio = audio;
    currentAudioUrl = url;
    await new Promise<void>((resolve, reject) => {
      // Handlers (not listeners) so a clip stopped midway never resolves on the next clip's end.
      audio!.onended = () => resolve();
      audio!.onerror = () =>
        reject(new Error('O navegador não conseguiu reproduzir o áudio da OpenAI.'));
      audio!.play().catch(reject);
    });
  } catch (error) {
    // Stopped while the clip was loading: not a failure, so no browser-voice fallback.
    if (generation !== queueGeneration) return;
    const detail = error instanceof Error ? error.message : 'falha desconhecida';
    throw new Error(`Não foi possível gerar a voz por IA da OpenAI: ${detail}`);
  } finally {
    if (audio && url) cleanupAudio(audio, url);
  }
}

async function speakWithBrowser(text: string, options: SpeakOptions): Promise<void> {
  if (!('speechSynthesis' in window)) return;
  const synth = window.speechSynthesis;
  const generation = queueGeneration;
  await ensureVoicesLoaded(synth);
  if (generation !== queueGeneration) return;
  const voice = options.voiceName
    ? synth.getVoices().find((candidate) => candidate.name === options.voiceName)
    : undefined;
  // One utterance per sentence: Chrome silently cuts a single utterance after ~15 s.
  const sentences = text.split(/(?<=[.!?…])\s+/).filter(Boolean);
  sentences.forEach((sentence, position) => {
    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.lang = options.lang ?? 'pt-BR';
    utterance.rate = getNarrationRate();
    if (voice) utterance.voice = voice;
    const release = () => activeUtterances.delete(utterance);
    utterance.addEventListener('end', release, { once: true });
    utterance.addEventListener('error', release, { once: true });
    if (position === sentences.length - 1 && options.onEnd) {
      const onEnd = options.onEnd;
      utterance.addEventListener('end', () => generation === queueGeneration && onEnd(), {
        once: true,
      });
    }
    activeUtterances.add(utterance);
    synth.speak(utterance);
  });
}

export async function speak(text: string, options: SpeakOptions = {}): Promise<void> {
  if (typeof window === 'undefined' || isVoiceBlocked()) return;
  if (options.interrupt) stopSpeaking();
  if (options.voiceName?.startsWith('openai:')) {
    const generation = queueGeneration;
    const queued = audioQueue.then(async () => {
      if (generation !== queueGeneration) return;
      await speakWithAi(text, options.voiceName!, generation);
      if (generation === queueGeneration) options.onEnd?.();
    });
    audioQueue = queued.catch(() => undefined);
    return queued;
  }
  await speakWithBrowser(text, options);
}

export function stopSpeaking(): void {
  if (typeof window === 'undefined') return;
  queueGeneration += 1;
  audioQueue = Promise.resolve();
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  activeUtterances.clear();
  if (currentAudio) currentAudio.pause();
  currentAudio = null;
  if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
  currentAudioUrl = null;
}
