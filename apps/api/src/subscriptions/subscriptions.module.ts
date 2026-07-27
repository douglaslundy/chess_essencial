import { Global, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { MercadoPagoWebhookController } from './mercado-pago-webhook.controller.js';
import { SocialAccessGuard } from './social-access.guard.js';
import { SubscriptionsController } from './subscriptions.controller.js';
import { SubscriptionsRepository } from './subscriptions.repository.js';
import { SubscriptionsService } from './subscriptions.service.js';

// Global (like SettingsModule) so ExercisesModule, LessonRuntimeModule,
// GamesModule and MatchmakingModule can inject SubscriptionsService for
// entitlement checks without each needing an explicit import back here.
// The admin-guarded plan CRUD controller is registered from AdminModule,
// mirroring how SettingsController is wired — see admin.module.ts.
@Global()
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [SubscriptionsController, MercadoPagoWebhookController],
  providers: [SubscriptionsRepository, SubscriptionsService, SocialAccessGuard],
  exports: [SubscriptionsService, SocialAccessGuard],
})
export class SubscriptionsModule {}
