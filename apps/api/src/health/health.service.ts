import { Injectable } from '@nestjs/common';

import type { HealthStatus } from '@xadrez/contracts';

@Injectable()
export class HealthService {
  getStatus(): HealthStatus {
    return {
      service: 'api',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
