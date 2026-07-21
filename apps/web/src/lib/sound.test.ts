// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetAudioContextForTests,
  isSoundMuted,
  playCaptureSound,
  playMoveSound,
  primeAudio,
  setSoundMuted,
} from './sound';

class MockOscillator {
  type = '';
  frequency = { value: 0 };
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class MockGainNode {
  gain = {
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  connect = vi.fn();
}

class MockAudioContext {
  currentTime = 0;
  state: 'running' | 'suspended' = 'running';
  destination = {};
  resume = vi.fn();
  createOscillator = vi.fn(() => new MockOscillator());
  createGain = vi.fn(() => new MockGainNode());
}

describe('sound', () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetAudioContextForTests();
  });

  afterEach(() => {
    // @ts-expect-error test cleanup of a global we may have set
    delete window.AudioContext;
  });

  it('defaults to unmuted and persists the mute preference', () => {
    expect(isSoundMuted()).toBe(false);
    setSoundMuted(true);
    expect(isSoundMuted()).toBe(true);
    setSoundMuted(false);
    expect(isSoundMuted()).toBe(false);
  });

  it('does not throw when AudioContext is unavailable', () => {
    // @ts-expect-error simulating a browser without Web Audio support
    delete window.AudioContext;
    expect(() => playMoveSound()).not.toThrow();
    expect(() => playCaptureSound()).not.toThrow();
    expect(() => primeAudio()).not.toThrow();
  });

  it('plays a single tone for a normal move', () => {
    const mockContext = new MockAudioContext();
    window.AudioContext = vi.fn(function () {
      return mockContext;
    }) as unknown as typeof AudioContext;
    playMoveSound();
    expect(mockContext.createOscillator).toHaveBeenCalledTimes(1);
  });

  it('plays two tones for a capture', () => {
    const mockContext = new MockAudioContext();
    window.AudioContext = vi.fn(function () {
      return mockContext;
    }) as unknown as typeof AudioContext;
    playCaptureSound();
    expect(mockContext.createOscillator).toHaveBeenCalledTimes(2);
  });

  it('does not play anything while muted', () => {
    const mockContext = new MockAudioContext();
    window.AudioContext = vi.fn(() => mockContext) as unknown as typeof AudioContext;
    setSoundMuted(true);
    playMoveSound();
    playCaptureSound();
    expect(mockContext.createOscillator).not.toHaveBeenCalled();
  });

  it('resumes a suspended context when primed', () => {
    const mockContext = new MockAudioContext();
    mockContext.state = 'suspended';
    window.AudioContext = vi.fn(function () {
      return mockContext;
    }) as unknown as typeof AudioContext;
    primeAudio();
    expect(mockContext.resume).toHaveBeenCalledTimes(1);
  });
});
