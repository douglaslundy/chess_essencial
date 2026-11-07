import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { signLiveKitToken } from './livekit-token.js';

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

describe('signLiveKitToken', () => {
  const now = 1_700_000_000;

  it('signs a valid HS256 JWT with the key as issuer and the user as subject', () => {
    const token = signLiveKitToken(
      'key',
      'secret-secret-secret',
      'user-1',
      'class-1',
      {
        canPublish: true,
        ttlSeconds: 600,
      },
      now,
    );
    const [header, payload, signature] = token.split('.') as [string, string, string];
    expect(decode(header)).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(decode(payload)).toMatchObject({ exp: now + 600, iss: 'key', sub: 'user-1' });
    const expected = createHmac('sha256', 'secret-secret-secret')
      .update(`${header}.${payload}`)
      .digest('base64url');
    expect(signature).toBe(expected);
  });

  it('lets only the teacher publish audio; students just listen', () => {
    const grantOf = (canPublish: boolean) =>
      decode(
        signLiveKitToken('k', 's', 'u', 'r', { canPublish, ttlSeconds: 60 }, now).split('.')[1]!,
      ).video;
    expect(grantOf(true)).toMatchObject({ canPublish: true, canSubscribe: true, roomJoin: true });
    expect(grantOf(false)).toMatchObject({ canPublish: false, canSubscribe: true });
  });

  it('builds an admin grant for permission changes', () => {
    const payload = decode(
      signLiveKitToken('k', 's', 'api', 'r', { admin: true, ttlSeconds: 60 }, now).split('.')[1]!,
    );
    expect(payload.video).toEqual({ room: 'r', roomAdmin: true });
  });
});
