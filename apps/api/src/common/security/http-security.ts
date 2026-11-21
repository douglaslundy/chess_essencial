import { createHmac } from 'node:crypto';
import { isSpanContextValid, SpanStatusCode, trace, type Span } from '@opentelemetry/api';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { ConfigService } from '@nestjs/config';

import type { MetricsService } from '../../observability/metrics.service.js';
import type { RedisService } from '../../redis/redis.service.js';

export const GLOBAL_REQUESTS_PER_MINUTE = 1200;

interface WindowEntry {
  count: number;
  resetsAt: number;
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

class FixedWindowLimiter {
  private readonly entries = new Map<string, WindowEntry>();

  consume(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const current = this.entries.get(key);
    if (!current || current.resetsAt <= now) {
      if (this.entries.size >= 10_000) this.removeExpired(now);
      this.entries.set(key, { count: 1, resetsAt: now + windowMs });
      return { allowed: true, limit, remaining: limit - 1, retryAfterSeconds: 0 };
    }
    current.count += 1;
    return {
      allowed: current.count <= limit,
      limit,
      remaining: Math.max(0, limit - current.count),
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetsAt - now) / 1000)),
    };
  }

  private removeExpired(now: number) {
    for (const [key, value] of this.entries) {
      if (value.resetsAt <= now) this.entries.delete(key);
    }
    if (this.entries.size >= 10_000) this.entries.delete(this.entries.keys().next().value ?? '');
  }
}

const REDIS_FIXED_WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {count, ttl}
`;

export class DistributedFixedWindowLimiter {
  private readonly fallback = new FixedWindowLimiter();

  constructor(
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
    private readonly production: boolean,
  ) {}

  async consume(
    key: string,
    limit: number,
    windowMs: number,
    sensitive: boolean,
  ): Promise<RateLimitResult> {
    if (this.redis.client.status === 'ready') {
      try {
        const response = (await this.redis.client.eval(
          REDIS_FIXED_WINDOW_SCRIPT,
          1,
          `xadrez:rate-limit:${key}`,
          String(windowMs),
        )) as [number, number];
        const count = Number(response[0]);
        const ttl = Math.max(1, Number(response[1]));
        return {
          allowed: count <= limit,
          limit,
          remaining: Math.max(0, limit - count),
          retryAfterSeconds: Math.max(1, Math.ceil(ttl / 1000)),
        };
      } catch {
        this.metrics.increment('xadrez_http_rate_limit_fallback_total', { reason: 'redis_error' });
      }
    } else {
      this.metrics.increment('xadrez_http_rate_limit_fallback_total', {
        reason: 'redis_unavailable',
      });
    }

    const fallbackLimit = this.production && sensitive ? Math.max(1, Math.floor(limit / 2)) : limit;
    return this.fallback.consume(key, fallbackLimit, windowMs);
  }
}

export function registerHttpSecurity(
  app: NestFastifyApplication,
  config: ConfigService,
  metrics: MetricsService,
  redis: RedisService,
) {
  const production = config.get<string>('NODE_ENV') === 'production';
  const limiter = new DistributedFixedWindowLimiter(redis, metrics, production);
  const fastify = app.getHttpAdapter().getInstance();

  fastify.addHook('onRequest', async (request, reply) => {
    const startedAt = process.hrtime.bigint();
    const span = trace
      .getTracer('xadrez-api')
      .startSpan(`${request.method} ${request.url.split('?')[0]}`);
    Object.assign(request, { securitySpan: span, securityStartedAt: startedAt });
    reply
      .header(
        'Content-Security-Policy',
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      )
      .header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
      .header('Referrer-Policy', 'no-referrer')
      .header('X-Content-Type-Options', 'nosniff')
      .header('X-Frame-Options', 'DENY')
      .header('X-Request-Id', request.id);
    if (production)
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (/^\/v1\/(auth|me|reports)/.test(request.url)) reply.header('Cache-Control', 'no-store');

    const mutating = ['POST', 'PUT', 'PATCH'].includes(request.method);
    const contentLength = Number(request.headers['content-length'] ?? 0);
    const contentType = request.headers['content-type']?.split(';')[0];
    // The backup restore streams the raw .xebak file, so it is the one route allowed a non-JSON body.
    const rawUpload =
      request.method === 'POST' &&
      contentType === 'application/octet-stream' &&
      request.url.split('?')[0] === '/v1/admin/backup/restore';
    if (mutating && contentLength > 0 && contentType !== 'application/json' && !rawUpload) {
      return reply.status(415).type('application/problem+json').send({
        type: 'https://xadrez-essencial.local/problems/415',
        title: 'Unsupported Media Type',
        status: 415,
        detail: 'Corpo mutável exige application/json',
        instance: request.url,
        requestId: request.id,
      });
    }

    const path = request.url.split('?')[0] ?? request.url;
    const cookieAuthenticatedAction =
      request.method === 'POST' &&
      (path === '/v1/auth/refresh' || path === '/v1/auth/logout') &&
      /(?:^|;\s*)(?:__Host-xadrez_refresh|xadrez_refresh)=/.test(request.headers.cookie ?? '');
    if (
      cookieAuthenticatedAction &&
      (request.headers.origin !== config.getOrThrow<string>('WEB_ORIGIN') ||
        request.headers['x-xadrez-csrf'] !== '1')
    ) {
      return reply.status(403).type('application/problem+json').send({
        type: 'https://xadrez-essencial.local/problems/403',
        title: 'Forbidden',
        status: 403,
        detail: 'Origem ou prova CSRF inv\u00e1lida',
        instance: request.url,
        requestId: request.id,
      });
    }
    // CORS preflights and health probes are not user traffic: counting them halved the budget.
    if (request.method === 'OPTIONS' || path === '/v1/health') return;
    const authAction = path.startsWith('/v1/auth/') ? path.slice('/v1/auth/'.length) : null;
    // Global budget per client IP sized for a page reload burst times several players sharing
    // one network (school, home Wi-Fi); login and reports keep their strict anti-abuse limits.
    const policy = authAction
      ? { bucket: `auth-${authAction}`, limit: authAction === 'login' ? 10 : 20, windowMs: 60_000 }
      : path === '/v1/reports'
        ? { bucket: 'reports', limit: 5, windowMs: 60_000 }
        : { bucket: 'global', limit: GLOBAL_REQUESTS_PER_MINUTE, windowMs: 60_000 };
    const ipKey = createHmac('sha256', config.getOrThrow<string>('AUTH_IP_HASH_SECRET'))
      .update(request.ip)
      .digest('hex');
    const result = await limiter.consume(
      `${policy.bucket}:${ipKey}`,
      policy.limit,
      policy.windowMs,
      policy.bucket !== 'global',
    );
    reply.header('RateLimit-Limit', result.limit).header('RateLimit-Remaining', result.remaining);
    if (!result.allowed) {
      metrics.increment('xadrez_http_rate_limit_rejections_total', { policy: policy.bucket });
      return reply
        .header('Retry-After', result.retryAfterSeconds)
        .status(429)
        .type('application/problem+json')
        .send({
          type: 'https://xadrez-essencial.local/problems/429',
          title: 'Too Many Requests',
          status: 429,
          detail: 'Limite de requisições excedido',
          instance: request.url,
          requestId: request.id,
        });
    }
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.url ?? 'unmatched';
    const status = String(reply.statusCode);
    metrics.increment('xadrez_http_requests_total', { method: request.method, route, status });
    const securedRequest = request as typeof request & {
      securitySpan?: Span;
      securityStartedAt?: bigint;
    };
    const startedAt = securedRequest.securityStartedAt;
    const durationMs = startedAt ? Number(process.hrtime.bigint() - startedAt) / 1_000_000 : 0;
    securedRequest.securitySpan?.setAttributes({
      'http.request.method': request.method,
      'http.route': route,
      'http.response.status_code': reply.statusCode,
    });
    securedRequest.securitySpan?.setStatus({
      code: reply.statusCode >= 500 ? SpanStatusCode.ERROR : SpanStatusCode.OK,
    });
    const spanContext = securedRequest.securitySpan?.spanContext();
    securedRequest.securitySpan?.end();
    if (config.get<string>('NODE_ENV') !== 'test') {
      process.stdout.write(
        `${JSON.stringify({
          event: 'http.request_completed',
          requestId: request.id,
          method: request.method,
          route,
          status: reply.statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
          ...(spanContext && isSpanContextValid(spanContext)
            ? { traceId: spanContext.traceId }
            : {}),
        })}\n`,
      );
    }
  });
}
