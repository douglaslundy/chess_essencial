import { Module } from '@nestjs/common';

import { AiProvidersModule } from '../ai-providers/ai-providers.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { TutorController } from './tutor.controller.js';
import { TutorService } from './tutor.service.js';

@Module({
  imports: [AuthModule, AiProvidersModule],
  controllers: [TutorController],
  providers: [TutorService],
})
export class TutorModule {}
