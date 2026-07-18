import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { RatingsModule } from '../ratings/ratings.module.js';

import { GamesService } from './application/games.service.js';
import { GamesRepository } from './infrastructure/games.repository.js';
import { GamesController } from './presentation/games.controller.js';
import { GamesGateway } from './presentation/games.gateway.js';

@Module({
  imports: [AuthModule, RatingsModule],
  controllers: [GamesController],
  providers: [GamesGateway, GamesRepository, GamesService],
  exports: [GamesService],
})
export class GamesModule {}
