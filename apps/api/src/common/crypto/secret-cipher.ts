import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

// SETTINGS_ENCRYPTION_KEY is an arbitrary-length passphrase (like the other
// auth secrets in apps/api/src/config/env.ts) — hashed down to the fixed
// 32-byte key aes-256-gcm requires, so the operator never has to generate a
// precisely-sized key by hand.
function deriveKey(secret: string) {
  return createHash('sha256').update(secret).digest();
}

/** Encrypts a secret (e.g. an AI provider API key) for storage at rest. */
export function encryptSecret(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

/** Reverses encryptSecret. Throws if `secret` is wrong or the payload was tampered with. */
export function decryptSecret(payload: string, secret: string): string {
  const key = deriveKey(secret);
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = raw.subarray(IV_LENGTH + 16);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Last 4 characters of the real key, for a masked UI preview like "•••• ab12". */
export function maskedKeyPreview(plaintext: string): string {
  return plaintext.slice(-4);
}
