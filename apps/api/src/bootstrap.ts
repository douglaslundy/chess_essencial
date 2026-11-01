import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { WsAdapter } from '@nestjs/platform-ws';

import { AppModule } from './app.module.js';
import { ProblemDetailsFilter } from './common/http/problem-details.filter.js';
import { registerHttpSecurity } from './common/security/http-security.js';
import { MetricsService } from './observability/metrics.service.js';
import { RedisService } from './redis/redis.service.js';

/**
 * @fastify/cors only allows GET, HEAD and POST unless told otherwise, which made every
 * browser PUT/PATCH/DELETE (e.g. saving an AI provider key) fail its preflight.
 */
export function corsOptions(webOrigin: string) {
  return {
    credentials: true,
    // Lets the admin page read the backup file name on a cross-origin download.
    exposedHeaders: ['content-disposition'],
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // Browsers reuse the preflight for 10 minutes instead of sending one before every call.
    maxAge: 600,
    origin: webOrigin,
  };
}

const TRUSTED_PROXIES = ['127.0.0.1', '::1', '10.0.0.0/8', '172.16.0.0/12'];

export async function createApp() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // 2 MB accommodates base64-encoded avatar uploads (image capped at 512 KB
    // binary server-side); other endpoints stay small by their own schemas.
    // Traefik and Docker forward from private networks: trusting only those hops makes
    // request.ip the real player (X-Forwarded-For) instead of one shared proxy address.
    new FastifyAdapter({ bodyLimit: 2_097_152, trustProxy: TRUSTED_PROXIES }),
  );
  const config = app.get(ConfigService);

  app.useWebSocketAdapter(new WsAdapter(app));

  app.setGlobalPrefix('v1');
  // Backup restore uploads arrive as raw bytes and are streamed (never buffered) into the
  // restore, so they are exempt from the JSON body limit.
  app
    .getHttpAdapter()
    .getInstance()
    .addContentTypeParser('application/octet-stream', (_request, payload, done) =>
      done(null, payload),
    );
  app.enableCors(corsOptions(config.getOrThrow<string>('WEB_ORIGIN')));
  app.enableShutdownHooks();
  app.useGlobalFilters(new ProblemDetailsFilter());
  registerHttpSecurity(app, config, app.get(MetricsService), app.get(RedisService));

  return app;
}
