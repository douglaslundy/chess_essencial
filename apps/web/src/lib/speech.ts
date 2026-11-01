// Speech queue shared by browser and AI-generated voices. New coaching messages
// are queued by default, so a position update or opponent reply never cuts the
// sentence currently being played. stopSpeaking() is the explicit cancellation
// boundary used when narration is muted, the screen is left, or a preview asks
// to interrupt.
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
  /** SpeechSynthesisVoice.name or an AI voice id. */
  voiceName?: string | null;
}

function cleanupAudio(audio: HTMLAudioElement, url: string): void {
  if (currentAudio === audio) currentAudio = null;
  if (currentAudioUrl === url) currentAudioUrl = null;
  URL.revokeObjectURL(url);
}

async function speakWithAi(text: string, voiceName: string, generation: number): Promise<void> {
  const token = window.localStorage.getItem('xadrez.access_token');
  if (!token) {
    throw new Error('Entre na sua conta para usar a voz por IA da OpenAI.');
  }

  const { api } = await import('./api/client');
  let audio: HTMLAudioElement | null = null;
  let url: string | null = null;
  try {
    const blob = await api.generateAiSpeech(
      { text, voice: voiceName as 'openai:marin' | 'openai:cedar' },
      token,
    );
    if (generation !== queueGeneration) return;
    url = URL.createObjectURL(blob);
    audio = audioElement();
    audio.src = url;
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
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = options.lang ?? 'pt-BR';
  if (options.voiceName) {
    const voice = synth.getVoices().find((candidate) => candidate.name === options.voiceName);
    if (voice) utterance.voice = voice;
  }
  const release = () => activeUtterances.delete(utterance);
  utterance.addEventListener('end', release, { once: true });
  utterance.addEventListener('error', release, { once: true });
  activeUtterances.add(utterance);
  synth.speak(utterance);
}

export async function speak(text: string, options: SpeakOptions = {}): Promise<void> {
  if (typeof window === 'undefined') return;
  if (options.interrupt) stopSpeaking();
  if (options.voiceName?.startsWith('openai:')) {
    const generation = queueGeneration;
    const queued = audioQueue.then(async () => {
      if (generation !== queueGeneration) return;
      await speakWithAi(text, options.voiceName!, generation);
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
