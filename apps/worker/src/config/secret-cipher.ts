import { createDecipheriv, createHash } from 'node:crypto';

// Mirrors apps/api/src/common/crypto/secret-cipher.ts (decrypt half only —
// the worker never writes a key, only reads the one an admin already
// configured through the API). Kept as a local copy since apps/worker
// never imports from apps/api's src; must stay byte-for-byte compatible
// with the encryption side.
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function deriveKey(secret: string) {
  return createHash('sha256').update(secret).digest();
}

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
