import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { SafetyModule } from '../safety/safety.module.js';
import { FeedController } from './feed.controller.js';
import { FeedRepository } from './feed.repository.js';
import { FeedService } from './feed.service.js';

@Module({
  imports: [AuthModule, SafetyModule],
  controllers: [FeedController],
  providers: [FeedRepository, FeedService],
})
export class FeedModule {}
