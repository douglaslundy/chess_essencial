import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { MessagesController } from './messages.controller.js';
import { MessagesRepository } from './messages.repository.js';
import { MessagesService } from './messages.service.js';

@Module({
  imports: [AuthModule],
  controllers: [MessagesController],
  providers: [MessagesRepository, MessagesService],
})
export class MessagesModule {}
