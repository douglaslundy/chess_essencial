import { Global, Module } from '@nestjs/common';

import { ReferralsRepository } from './referrals.repository.js';
import { ReferralsService } from './referrals.service.js';

// Global, no controllers of its own (same shape as SettingsModule): both
// ReferralsController (user-facing) and ReferralsAdminController need
// AccessTokenGuard/AdminGuard from AuthModule/AdminModule, and AuthService
// itself needs ReferralsService (attribute on register, reward on verify)
// — registering the controllers from those modules instead of importing
// AuthModule here avoids a circular module dependency.
@Global()
@Module({
  providers: [ReferralsRepository, ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
