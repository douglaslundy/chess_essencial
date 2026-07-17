import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}

  async record(
    actorUserId: string | null,
    action: string,
    entityType: string,
    entityId: string | null,
    metadata: Record<string, string | number | boolean> = {},
  ) {
    await this.database.client`
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
      VALUES (${actorUserId}, ${action}, ${entityType}, ${entityId}, ${JSON.stringify(metadata)}::jsonb)
    `;
  }
}
