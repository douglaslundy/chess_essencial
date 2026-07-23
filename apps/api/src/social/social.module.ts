import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { SocialController } from './social.controller.js';
import { SocialRepository } from './social.repository.js';
import { SocialService } from './social.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SocialController],
  providers: [SocialRepository, SocialService],
})
export class SocialModule {}
