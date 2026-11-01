import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AdminModule } from './admin/admin.module.js';
import { AiProvidersModule } from './ai-providers/ai-providers.module.js';
import { AuthModule } from './auth/auth.module.js';
import { validateApiEnv } from './config/env.js';
import { CourseModule } from './course/course.module.js';
import { CoursesModule } from './courses/courses.module.js';
import { DatabaseModule } from './database/database.module.js';
import { ExercisesModule } from './exercises/exercises.module.js';
import { BackupModule } from './backup/backup.module.js';
import { LibraryModule } from './library/library.module.js';
import { FeedModule } from './feed/feed.module.js';
import { GamesModule } from './games/games.module.js';
import { HealthController } from './health/health.controller.js';
import { HealthService } from './health/health.service.js';
import { LearningPathModule } from './learning-path/learning-path.module.js';
import { LessonRuntimeModule } from './lesson-runtime/lesson-runtime.module.js';
import { MatchmakingModule } from './matchmaking/matchmaking.module.js';
import { MessagesModule } from './messages/messages.module.js';
import { ObservabilityModule } from './observability/observability.module.js';
import { RatingsModule } from './ratings/ratings.module.js';
import { ReferralsModule } from './referrals/referrals.module.js';
import { RedisModule } from './redis/redis.module.js';
import { SafetyModule } from './safety/safety.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { SocialModule } from './social/social.module.js';
import { StorageModule } from './storage/storage.module.js';
import { SubscriptionsModule } from './subscriptions/subscriptions.module.js';
import { VoiceModule } from './voice/voice.module.js';

@Module({
  imports: [
    AdminModule,
    AiProvidersModule,
    AuthModule,
    CourseModule,
    CoursesModule,
    DatabaseModule,
    ExercisesModule,
    LibraryModule,
    BackupModule,
    FeedModule,
    GamesModule,
    LearningPathModule,
    LessonRuntimeModule,
    MatchmakingModule,
    MessagesModule,
    ObservabilityModule,
    RatingsModule,
    ReferralsModule,
    RedisModule,
    SafetyModule,
    SettingsModule,
    SocialModule,
    StorageModule,
    SubscriptionsModule,
    VoiceModule,
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
