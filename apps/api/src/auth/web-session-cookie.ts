import type { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';

const PRODUCTION_COOKIE = '__Host-xadrez_refresh';
const DEVELOPMENT_COOKIE = 'xadrez_refresh';

function cookieName(config: ConfigService) {
  return config.get<string>('NODE_ENV') === 'production' ? PRODUCTION_COOKIE : DEVELOPMENT_COOKIE;
}

function parseCookies(header: string | undefined) {
  const cookies = new Map<string, string>();
  for (const part of header?.split(';') ?? []) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) cookies.set(name, decodeURIComponent(value));
  }
  return cookies;
}

function serializeCookie(name: string, value: string, maxAge: number, secure: boolean) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function isWebClient(request: FastifyRequest) {
  return request.headers['x-xadrez-client'] === 'web';
}

export function readRefreshCookie(request: FastifyRequest, config: ConfigService) {
  const cookies = parseCookies(request.headers.cookie);
  return cookies.get(cookieName(config)) ?? cookies.get(PRODUCTION_COOKIE) ?? null;
}

export function setRefreshCookie(reply: FastifyReply, refreshToken: string, config: ConfigService) {
  const production = config.get<string>('NODE_ENV') === 'production';
  const maxAge = config.get<number>('AUTH_REFRESH_TTL_SECONDS', 2_592_000);
  reply.header('Set-Cookie', serializeCookie(cookieName(config), refreshToken, maxAge, production));
}

export function clearRefreshCookie(reply: FastifyReply, config: ConfigService) {
  const production = config.get<string>('NODE_ENV') === 'production';
  reply.header('Set-Cookie', serializeCookie(cookieName(config), '', 0, production));
}
