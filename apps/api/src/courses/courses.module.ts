import { Module } from '@nestjs/common';

import { AccessTokenGuard } from '../auth/access-token.guard.js';
import { AuthModule } from '../auth/auth.module.js';
import { CoursesService } from './courses.service.js';
import { CoursesController } from './courses.controller.js';
import { CoursesRepository } from './courses.repository.js';

@Module({
  imports: [AuthModule],
  controllers: [CoursesController],
  providers: [AccessTokenGuard, CoursesRepository, CoursesService],
})
export class CoursesModule {}
