import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { ClassroomController } from './classroom.controller.js';
import { ClassroomRepository } from './classroom.repository.js';

@Module({
  imports: [AuthModule],
  controllers: [ClassroomController],
  providers: [ClassroomRepository],
})
export class ClassroomModule {}
