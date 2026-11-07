import { createHmac } from 'node:crypto';

const b64url = (value: Buffer | string) => Buffer.from(value).toString('base64url');

export interface LiveKitGrant {
  /** Admin calls (changing a participant's permissions) instead of joining the room. */
  admin?: boolean;
  canPublish?: boolean;
  /** Seconds the token stays valid. */
  ttlSeconds: number;
}

/**
 * LiveKit access tokens are plain HS256 JWTs, so no SDK is needed: `iss` is the API key, `sub`
 * the participant identity and `video` the room grant. Nothing is sent without the secret.
 */
export function signLiveKitToken(
  apiKey: string,
  apiSecret: string,
  identity: string,
  room: string,
  grant: LiveKitGrant,
  now = Math.floor(Date.now() / 1000),
): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const video = grant.admin
    ? { room, roomAdmin: true }
    : {
        canPublish: grant.canPublish === true,
        canPublishData: false,
        canSubscribe: true,
        room,
        roomJoin: true,
      };
  const payload = b64url(
    JSON.stringify({ exp: now + grant.ttlSeconds, iss: apiKey, nbf: now, sub: identity, video }),
  );
  const signature = createHmac('sha256', apiSecret).update(`${header}.${payload}`).digest();
  return `${header}.${payload}.${b64url(signature)}`;
}
