import { Module } from '@nestjs/common';

import { UsersController } from '../users/users.controller.js';
import { UsersModule } from '../users/users.module.js';
import { AccessTokenGuard } from './access-token.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [UsersModule],
  controllers: [AuthController, UsersController],
  providers: [AccessTokenGuard, AuthService],
  exports: [AccessTokenGuard, AuthService],
})
export class AuthModule {}
