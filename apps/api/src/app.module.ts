import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module.js';
import { validateApiEnv } from './config/env.js';
import { CoursesModule } from './courses/courses.module.js';
import { DatabaseModule } from './database/database.module.js';
import { ExercisesModule } from './exercises/exercises.module.js';
import { GamesModule } from './games/games.module.js';
import { HealthController } from './health/health.controller.js';
import { HealthService } from './health/health.service.js';
import { LessonRuntimeModule } from './lesson-runtime/lesson-runtime.module.js';
import { MatchmakingModule } from './matchmaking/matchmaking.module.js';
import { RatingsModule } from './ratings/ratings.module.js';

@Module({
  imports: [
    AuthModule,
    CoursesModule,
    DatabaseModule,
    ExercisesModule,
    GamesModule,
    LessonRuntimeModule,
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
