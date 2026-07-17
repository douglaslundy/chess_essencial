import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { LessonRuntimeController } from './lesson-runtime.controller.js';
import { LessonRuntimeRepository } from './lesson-runtime.repository.js';
import { LessonRuntimeService } from './lesson-runtime.service.js';

@Module({
  imports: [AuthModule],
  controllers: [LessonRuntimeController],
  providers: [LessonRuntimeRepository, LessonRuntimeService],
})
export class LessonRuntimeModule {}
