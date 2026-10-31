import type { PieceSymbol } from 'chess.js';

// Synthesized with WebAudio: no audio files to ship or cache, and each power gets its own timbre.
let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  context ??= new AudioContext();
  // Browsers suspend audio until a user gesture; the move click usually counts.
  if (context.state === 'suspended') void context.resume().catch(() => undefined);
  return context;
}

function noise(ctx: AudioContext, seconds: number): AudioBufferSourceNode {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  return source;
}

function envelope(ctx: AudioContext, at: number, peak: number, decay: number): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  gain.connect(ctx.destination);
  return gain;
}

function tone(
  ctx: AudioContext,
  at: number,
  type: OscillatorType,
  from: number,
  to: number,
  seconds: number,
  peak: number,
) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + seconds);
  osc.connect(envelope(ctx, at, peak, seconds));
  osc.start(at);
  osc.stop(at + seconds + 0.05);
}

function burst(
  ctx: AudioContext,
  at: number,
  seconds: number,
  filter: BiquadFilterType,
  frequency: number,
  peak: number,
) {
  const source = noise(ctx, seconds);
  const biquad = ctx.createBiquadFilter();
  biquad.type = filter;
  biquad.frequency.value = frequency;
  source.connect(biquad).connect(envelope(ctx, at, peak, seconds));
  source.start(at);
}

/** Power sound at `delay` seconds (when the attack starts), followed by the shatter. */
export function playCaptureSound(attacker: PieceSymbol, delay: number, impact: number) {
  const ctx = audio();
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const hit = ctx.currentTime + impact;
  switch (attacker) {
    case 'p': // sword: metallic ring
      tone(ctx, t, 'triangle', 2400, 1800, 0.45, 0.12);
      burst(ctx, t, 0.25, 'highpass', 5000, 0.1);
      break;
    case 'n': // trample: hooves then a thud
      burst(ctx, t, 0.08, 'lowpass', 900, 0.3);
      burst(ctx, t + 0.15, 0.08, 'lowpass', 900, 0.3);
      tone(ctx, hit, 'sine', 120, 40, 0.5, 0.5);
      break;
    case 'b': // holy beam: rising shimmer
      tone(ctx, t, 'sine', 400, 1600, 0.6, 0.15);
      tone(ctx, t + 0.05, 'sine', 600, 2400, 0.6, 0.08);
      break;
    case 'r': // crush: heavy boom
      tone(ctx, hit, 'sine', 80, 30, 0.9, 0.6);
      burst(ctx, hit, 0.6, 'lowpass', 400, 0.5);
      break;
    case 'q': // arcane storm: whoosh + sparkle arpeggio
      burst(ctx, t, 0.5, 'bandpass', 1200, 0.2);
      [880, 1320, 1760, 2640].forEach((f, i) => tone(ctx, t + i * 0.08, 'sine', f, f, 0.25, 0.08));
      break;
    case 'k': // royal lightning: sharp crack + rumble
      burst(ctx, t, 0.18, 'highpass', 2500, 0.45);
      burst(ctx, t + 0.05, 1.1, 'lowpass', 220, 0.35);
      break;
  }
  // Shatter, shared by every power.
  burst(ctx, hit, 0.35, 'bandpass', 2600, 0.25);
  tone(ctx, hit, 'square', 300, 60, 0.25, 0.05);
}
