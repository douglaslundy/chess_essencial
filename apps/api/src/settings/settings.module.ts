import { Global, Module } from '@nestjs/common';

import { SettingsRepository } from './settings.repository.js';
import { SettingsService } from './settings.service.js';

// Global (no controller here) so any module — notably AuthModule's
// VerificationEmailService — can inject SettingsService without a circular
// import back to whichever module owns the admin-guarded settings routes.
@Global()
@Module({
  providers: [SettingsRepository, SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
