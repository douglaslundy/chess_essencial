import { Module } from '@nestjs/common';

import { AiProvidersModule } from '../ai-providers/ai-providers.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { OpeningsController } from './openings.controller.js';
import { OpeningsService } from './openings.service.js';

@Module({
  imports: [AuthModule, AiProvidersModule],
  controllers: [OpeningsController],
  providers: [OpeningsService],
})
export class OpeningsModule {}
