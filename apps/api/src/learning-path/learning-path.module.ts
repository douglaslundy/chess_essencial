import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { ExercisesModule } from '../exercises/exercises.module.js';
import { LessonRuntimeModule } from '../lesson-runtime/lesson-runtime.module.js';
import { LearningPathController } from './learning-path.controller.js';
import { LearningPathRepository } from './learning-path.repository.js';
import { LearningPathService } from './learning-path.service.js';

@Module({
  controllers: [LearningPathController],
  imports: [AuthModule, ExercisesModule, LessonRuntimeModule],
  providers: [LearningPathRepository, LearningPathService],
})
export class LearningPathModule {}
