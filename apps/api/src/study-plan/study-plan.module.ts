import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { StudyPlanController } from './study-plan.controller.js';
import { StudyPlanRepository } from './study-plan.repository.js';

@Module({
  imports: [AuthModule],
  controllers: [StudyPlanController],
  providers: [StudyPlanRepository],
})
export class StudyPlanModule {}
