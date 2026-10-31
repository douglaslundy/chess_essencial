import { Module } from '@nestjs/common';

import { AiProvidersModule } from '../ai-providers/ai-providers.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { LibraryController } from './library.controller.js';
import { LibraryRepository } from './library.repository.js';
import { LibraryService } from './library.service.js';

@Module({
  imports: [AuthModule, AiProvidersModule],
  controllers: [LibraryController],
  providers: [LibraryRepository, LibraryService],
})
export class LibraryModule {}
