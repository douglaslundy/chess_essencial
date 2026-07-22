const MUTE_KEY = 'xadrez.sound_muted';

let audioContext: AudioContext | null | undefined;

function getContext(): AudioContext | null {
  if (audioContext !== undefined) return audioContext;
  if (typeof window === 'undefined') {
    audioContext = null;
    return audioContext;
  }
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  audioContext = Ctor ? new Ctor() : null;
  return audioContext;
}

export function __resetAudioContextForTests(): void {
  audioContext = undefined;
}

export function isSoundMuted(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(MUTE_KEY) === 'true';
}

export function setSoundMuted(muted: boolean): void {
  window.localStorage.setItem(MUTE_KEY, muted ? 'true' : 'false');
}

export function primeAudio(): void {
  const context = getContext();
  if (context && context.state === 'suspended') void context.resume();
}

function playTone(
  frequency: number,
  startOffsetSeconds: number,
  durationMs: number,
  context: AudioContext,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  const startTime = context.currentTime + startOffsetSeconds;
  const durationSeconds = durationMs / 1000;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.25, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSeconds);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + durationSeconds);
}

export function playMoveSound(): void {
  if (isSoundMuted()) return;
  const context = getContext();
  if (!context) return;
  playTone(660, 0, 90, context);
}

export function playCaptureSound(): void {
  if (isSoundMuted()) return;
  const context = getContext();
  if (!context) return;
  playTone(420, 0, 90, context);
  playTone(280, 0.08, 130, context);
}

export function playVictorySound(): void {
  if (isSoundMuted()) return;
  const context = getContext();
  if (!context) return;
  // Rising major triad (C–E–G–C) as a small fanfare.
  playTone(523.25, 0, 140, context);
  playTone(659.25, 0.12, 140, context);
  playTone(783.99, 0.24, 160, context);
  playTone(1046.5, 0.38, 220, context);
}

export function playDefeatSound(): void {
  if (isSoundMuted()) return;
  const context = getContext();
  if (!context) return;
  // Falling minor interval to signal a miss.
  playTone(392, 0, 160, context);
  playTone(311.13, 0.14, 240, context);
}
