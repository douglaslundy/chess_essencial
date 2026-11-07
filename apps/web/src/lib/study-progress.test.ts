// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { markStudyDone, readStudyDone } from './study-progress';

describe('study progress', () => {
  beforeEach(() => window.localStorage.clear());

  it('starts empty and remembers finished items per user and kind', () => {
    expect(readStudyDone('u1', 'exercise').size).toBe(0);
    markStudyDone('u1', 'exercise', 'a');
    markStudyDone('u1', 'game', 'g');
    expect([...readStudyDone('u1', 'exercise')]).toEqual(['a']);
    expect([...readStudyDone('u1', 'game')]).toEqual(['g']);
    expect(readStudyDone('u2', 'exercise').size).toBe(0);
  });

  it('survives corrupted storage', () => {
    window.localStorage.setItem('xadrez.study.u1.exercise', '{oops');
    expect(readStudyDone('u1', 'exercise').size).toBe(0);
  });
});
