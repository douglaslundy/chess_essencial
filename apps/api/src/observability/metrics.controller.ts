import { Controller, Get, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { MetricsService } from './metrics.service.js';

@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
  ) {}

  @Get()
  getMetrics(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      const token = this.config.get<string>('METRICS_TOKEN');
      if (!token || request.headers.authorization !== `Bearer ${token}`) {
        throw new UnauthorizedException('Credencial de métricas inválida');
      }
    }
    return reply.type('text/plain; version=0.0.4; charset=utf-8').send(this.metrics.render());
  }
}
