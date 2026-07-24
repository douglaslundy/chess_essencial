import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class SettingsRepository {
  constructor(private readonly database: DatabaseService) {}

  async get<T>(key: string): Promise<T | null> {
    const [row] = await this.database.client<{ value: T }[]>`
      SELECT value FROM platform_settings WHERE key = ${key}
    `;
    return row ? row.value : null;
  }

  async set(key: string, value: unknown, updatedByUserId: string): Promise<void> {
    await this.database.client`
      INSERT INTO platform_settings (key, value, updated_by_user_id, updated_at)
      VALUES (${key}, ${JSON.stringify(value)}::jsonb, ${updatedByUserId}, now())
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value, updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = now()
    `;
  }
}
