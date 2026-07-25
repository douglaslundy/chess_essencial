import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { ReferralsAdminController } from '../referrals/referrals-admin.controller.js';
import { SettingsController } from '../settings/settings.controller.js';
import { SubscriptionsAdminController } from '../subscriptions/subscriptions-admin.controller.js';
import { AdminController } from './admin.controller.js';
import { AdminGuard } from './admin.guard.js';
import { AdminRepository } from './admin.repository.js';
import { AdminService } from './admin.service.js';

@Module({
  imports: [AuthModule],
  controllers: [
    AdminController,
    SettingsController,
    SubscriptionsAdminController,
    ReferralsAdminController,
  ],
  providers: [AdminGuard, AdminRepository, AdminService],
})
export class AdminModule {}
