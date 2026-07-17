import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { SafetyController } from './safety.controller.js';
import { SafetyRepository } from './safety.repository.js';
import { SafetyService } from './safety.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SafetyController],
  providers: [SafetyRepository, SafetyService],
  exports: [SafetyRepository],
})
export class SafetyModule {}
