import { describe, expect, it } from 'vitest';

import { generateBotIdentities } from './generate-identities.js';

function seededRandom(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
}

describe('generateBotIdentities', () => {
  it('generates the requested number of distinct identities', () => {
    const identities = generateBotIdentities(200, seededRandom(42));
    expect(identities).toHaveLength(200);
  });

  it('never repeats a username or display name', () => {
    const identities = generateBotIdentities(200, seededRandom(7));
    expect(new Set(identities.map((identity) => identity.username)).size).toBe(200);
    expect(new Set(identities.map((identity) => identity.displayName)).size).toBe(200);
  });

  it('produces usernames made only of lowercase letters, digits and underscores', () => {
    const identities = generateBotIdentities(50, seededRandom(1));
    for (const identity of identities) {
      expect(identity.username).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it('derives an email on the reserved-invalid bot domain from the username', () => {
    const identities = generateBotIdentities(10, seededRandom(3));
    for (const identity of identities) {
      expect(identity.email).toBe(`${identity.username}@bots.internal.xadrez.invalid`);
    }
  });

  it('spreads target ratings across a plausible human range', () => {
    const identities = generateBotIdentities(200, seededRandom(99));
    for (const identity of identities) {
      expect(identity.targetRating).toBeGreaterThanOrEqual(700);
      expect(identity.targetRating).toBeLessThan(2250);
    }
    const distinctRatings = new Set(identities.map((identity) => identity.targetRating));
    expect(distinctRatings.size).toBeGreaterThan(20);
  });

  it('is deterministic for a given random source', () => {
    const first = generateBotIdentities(30, seededRandom(123));
    const second = generateBotIdentities(30, seededRandom(123));
    expect(first).toEqual(second);
  });

  it('gives every persona a birth date corresponding to an age between 18 and 65', () => {
    const now = new Date(Date.UTC(2026, 0, 1));
    const identities = generateBotIdentities(200, seededRandom(55), now);
    for (const identity of identities) {
      expect(identity.birthDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const age = now.getUTCFullYear() - Number(identity.birthDate.slice(0, 4));
      expect(age).toBeGreaterThanOrEqual(18);
      expect(age).toBeLessThanOrEqual(65);
    }
  });
});
