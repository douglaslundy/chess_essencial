import { Global, Module } from '@nestjs/common';

import { AuditService } from './audit.service.js';
import { MetricsController } from './metrics.controller.js';
import { MetricsService } from './metrics.service.js';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [AuditService, MetricsService],
  exports: [AuditService, MetricsService],
})
export class ObservabilityModule {}
