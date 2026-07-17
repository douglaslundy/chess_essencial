import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { WsAdapter } from '@nestjs/platform-ws';

import { AppModule } from './app.module.js';
import { ProblemDetailsFilter } from './common/http/problem-details.filter.js';
import { registerHttpSecurity } from './common/security/http-security.js';
import { MetricsService } from './observability/metrics.service.js';

export async function createApp() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 1_048_576 }),
  );
  const config = app.get(ConfigService);

  app.useWebSocketAdapter(new WsAdapter(app));

  app.setGlobalPrefix('v1');
  app.enableCors({
    credentials: true,
    origin: config.getOrThrow<string>('WEB_ORIGIN'),
  });
  app.enableShutdownHooks();
  app.useGlobalFilters(new ProblemDetailsFilter());
  registerHttpSecurity(app, config, app.get(MetricsService));

  return app;
}
