import { Module } from '@nestjs/common';

import { AdminGuard } from '../admin/admin.guard.js';
import { AuthModule } from '../auth/auth.module.js';
import { BackupController } from './backup.controller.js';
import { BackupService } from './backup.service.js';

@Module({
  imports: [AuthModule],
  controllers: [BackupController],
  providers: [AdminGuard, BackupService],
})
export class BackupModule {}
