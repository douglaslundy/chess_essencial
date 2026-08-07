import { Module } from '@nestjs/common';

import { AiProvidersModule } from '../ai-providers/ai-providers.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { VoiceController } from './voice.controller.js';
import { VoiceService } from './voice.service.js';

@Module({
  imports: [AiProvidersModule, AuthModule],
  controllers: [VoiceController],
  providers: [VoiceService],
})
export class VoiceModule {}
