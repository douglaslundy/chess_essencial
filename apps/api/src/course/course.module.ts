import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CourseController } from './course.controller.js';
import { CourseRepository } from './course.repository.js';

@Module({
  imports: [AuthModule],
  controllers: [CourseController],
  providers: [CourseRepository],
})
export class CourseModule {}
