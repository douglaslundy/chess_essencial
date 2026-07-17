import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module.js';
import { validateApiEnv } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { GamesModule } from './games/games.module.js';
import { HealthController } from './health/health.controller.js';
import { HealthService } from './health/health.service.js';
import { MatchmakingModule } from './matchmaking/matchmaking.module.js';
import { RatingsModule } from './ratings/ratings.module.js';

@Module({
  imports: [
    AuthModule,
    DatabaseModule,
    GamesModule,
    MatchmakingModule,
    RatingsModule,
    ConfigModule.forRoot({
      envFilePath: ['../../.env', '.env'],
      isGlobal: true,
      validate: validateApiEnv,
    }),
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
