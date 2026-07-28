import { Module } from '@nestjs/common';

import { AiProvidersModule } from '../ai-providers/ai-providers.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { RatingsModule } from '../ratings/ratings.module.js';

import { GamesService } from './application/games.service.js';
import { GamesRepository } from './infrastructure/games.repository.js';
import { LiveNarrationService } from './narration/live-narration.service.js';
import { GamesController } from './presentation/games.controller.js';
import { GamesGateway } from './presentation/games.gateway.js';

@Module({
  imports: [AuthModule, RatingsModule, AiProvidersModule],
  controllers: [GamesController],
  providers: [GamesGateway, GamesRepository, GamesService, LiveNarrationService],
  exports: [GamesService],
})
export class GamesModule {}
