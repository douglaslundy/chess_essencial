import type { CreateReportInput, UpdatePrivacyInput } from '@xadrez/contracts';
import { BadRequestException, Injectable } from '@nestjs/common';

import { sanitizeUserText } from '../common/security/sanitize-user-text.js';
import { SafetyRepository } from './safety.repository.js';

@Injectable()
export class SafetyService {
  constructor(private readonly safety: SafetyRepository) {}

  privacy(userId: string) {
    return this.safety.privacy(userId);
  }

  updatePrivacy(userId: string, input: UpdatePrivacyInput) {
    return this.safety.updatePrivacy(userId, input);
  }

  listBlocks(userId: string) {
    return this.safety.listBlocks(userId);
  }

  async block(userId: string, blockedUserId: string) {
    if (userId === blockedUserId)
      throw new BadRequestException('Não é possível bloquear a si mesmo');
    await this.safety.block(userId, blockedUserId);
  }

  async unblock(userId: string, blockedUserId: string) {
    await this.safety.unblock(userId, blockedUserId);
  }

  createReport(userId: string, input: CreateReportInput) {
    if (input.reportedUserId === userId) {
      throw new BadRequestException('Não é possível denunciar a si mesmo');
    }
    const description = input.description ? sanitizeUserText(input.description) : null;
    if (input.description && !description) {
      throw new BadRequestException('Descrição inválida');
    }
    return this.safety.createReport(userId, input, description);
  }
}
