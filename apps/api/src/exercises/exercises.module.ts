import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { ExercisesController } from './exercises.controller.js';
import { ExercisesRepository } from './exercises.repository.js';
import { ExercisesService } from './exercises.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ExercisesController],
  providers: [ExercisesRepository, ExercisesService],
  exports: [ExercisesService],
})
export class ExercisesModule {}
