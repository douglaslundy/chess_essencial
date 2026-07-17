import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { MatchmakingService } from './application/matchmaking.service.js';
import { MatchmakingRepository } from './infrastructure/matchmaking.repository.js';
import { MatchmakingController } from './presentation/matchmaking.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [MatchmakingController],
  providers: [MatchmakingRepository, MatchmakingService],
})
export class MatchmakingModule {}
