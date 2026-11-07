import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { PlayerMetricsController } from './player-metrics.controller.js';
import { PlayerMetricsRepository } from './player-metrics.repository.js';

@Module({
  imports: [AuthModule],
  controllers: [PlayerMetricsController],
  providers: [PlayerMetricsRepository],
})
export class PlayerMetricsModule {}
