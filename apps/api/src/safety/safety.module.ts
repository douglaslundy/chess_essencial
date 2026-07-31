import { Module } from '@nestjs/common';

import { AdminGuard } from '../admin/admin.guard.js';
import { AuthModule } from '../auth/auth.module.js';
import { ModerationAdminController } from './moderation-admin.controller.js';
import { ModerationAdminRepository } from './moderation-admin.repository.js';
import { ModerationAdminService } from './moderation-admin.service.js';
import { SafetyController } from './safety.controller.js';
import { SafetyRepository } from './safety.repository.js';
import { SafetyService } from './safety.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SafetyController, ModerationAdminController],
  providers: [
    AdminGuard,
    ModerationAdminRepository,
    ModerationAdminService,
    SafetyRepository,
    SafetyService,
  ],
  exports: [SafetyRepository],
})
export class SafetyModule {}
