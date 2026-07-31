import type { ModerateReportInput, ModerationQueueQuery } from '@xadrez/contracts';
import { Injectable } from '@nestjs/common';

import { ModerationAdminRepository } from './moderation-admin.repository.js';

@Injectable()
export class ModerationAdminService {
  constructor(private readonly moderation: ModerationAdminRepository) {}

  list(query: ModerationQueueQuery) {
    return this.moderation.list(query);
  }

  detail(reportId: string) {
    return this.moderation.detail(reportId);
  }

  moderate(actorUserId: string, reportId: string, input: ModerateReportInput) {
    return this.moderation.moderate(actorUserId, reportId, input);
  }
}
