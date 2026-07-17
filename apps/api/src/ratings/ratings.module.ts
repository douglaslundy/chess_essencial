import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { RatingsService } from './application/ratings.service.js';
import { RatingsRepository } from './infrastructure/ratings.repository.js';
import { RatingsController } from './presentation/ratings.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [RatingsController],
  providers: [RatingsRepository, RatingsService],
  exports: [RatingsService],
})
export class RatingsModule {}
