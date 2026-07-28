import { describe, expect, it } from 'vitest';

import { decryptSecret, encryptSecret, maskedKeyPreview } from './secret-cipher.js';

describe('secret-cipher', () => {
  it('round-trips a secret through encrypt/decrypt', () => {
    const ciphertext = encryptSecret('sk-ant-super-secret-key', 'a-passphrase-of-any-length');
    expect(ciphertext).not.toContain('sk-ant-super-secret-key');
    expect(decryptSecret(ciphertext, 'a-passphrase-of-any-length')).toBe('sk-ant-super-secret-key');
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = encryptSecret('same-plaintext', 'secret');
    const b = encryptSecret('same-plaintext', 'secret');
    expect(a).not.toBe(b);
  });

  it('fails to decrypt with the wrong key', () => {
    const ciphertext = encryptSecret('sk-real-key', 'correct-secret');
    expect(() => decryptSecret(ciphertext, 'wrong-secret')).toThrow();
  });

  it('fails to decrypt a tampered payload', () => {
    const ciphertext = encryptSecret('sk-real-key', 'secret');
    const tampered = Buffer.from(ciphertext, 'base64');
    tampered[tampered.length - 1] = (tampered[tampered.length - 1]! + 1) % 256;
    expect(() => decryptSecret(tampered.toString('base64'), 'secret')).toThrow();
  });

  it('masks a key down to its last 5 characters', () => {
    expect(maskedKeyPreview('sk-ant-abcdef1234')).toBe('f1234');
  });
});
