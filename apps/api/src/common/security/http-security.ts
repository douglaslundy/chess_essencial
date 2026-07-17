import { isSpanContextValid, SpanStatusCode, trace, type Span } from '@opentelemetry/api';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { ConfigService } from '@nestjs/config';

import type { MetricsService } from '../../observability/metrics.service.js';

interface WindowEntry {
  count: number;
  resetsAt: number;
}

class FixedWindowLimiter {
  private readonly entries = new Map<string, WindowEntry>();

  consume(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    const current = this.entries.get(key);
    if (!current || current.resetsAt <= now) {
      if (this.entries.size >= 10_000) this.removeExpired(now);
      this.entries.set(key, { count: 1, resetsAt: now + windowMs });
      return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
    }
    current.count += 1;
    return {
      allowed: current.count <= limit,
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

export function registerHttpSecurity(
  app: NestFastifyApplication,
  config: ConfigService,
  metrics: MetricsService,
) {
  const limiter = new FixedWindowLimiter();
  const fastify = app.getHttpAdapter().getInstance();
  const production = config.get<string>('NODE_ENV') === 'production';

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
    if (
      mutating &&
      contentLength > 0 &&
      request.headers['content-type']?.split(';')[0] !== 'application/json'
    ) {
      return reply.status(415).type('application/problem+json').send({
        type: 'https://xadrez-essencial.local/problems/415',
        title: 'Unsupported Media Type',
        status: 415,
        detail: 'Corpo mutável exige application/json',
        instance: request.url,
        requestId: request.id,
      });
    }

    const policy = request.url.startsWith('/v1/auth/')
      ? { bucket: 'auth', limit: 10, windowMs: 60_000 }
      : request.url.startsWith('/v1/reports')
        ? { bucket: 'reports', limit: 5, windowMs: 60_000 }
        : { bucket: 'global', limit: 120, windowMs: 60_000 };
    const result = limiter.consume(`${policy.bucket}:${request.ip}`, policy.limit, policy.windowMs);
    reply.header('RateLimit-Limit', policy.limit).header('RateLimit-Remaining', result.remaining);
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
