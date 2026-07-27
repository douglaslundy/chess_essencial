import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { AdminGuard } from '../admin/admin.guard.js';
import { AiProvidersController } from './ai-providers.controller.js';
import { AiProvidersRepository } from './ai-providers.repository.js';
import { AiProvidersService } from './ai-providers.service.js';

// SettingsModule and ObservabilityModule are @Global(), so SettingsRepository
// and AuditService are available here without being imported explicitly.
@Module({
  imports: [AuthModule],
  controllers: [AiProvidersController],
  providers: [AdminGuard, AiProvidersRepository, AiProvidersService],
  exports: [AiProvidersService],
})
export class AiProvidersModule {}
