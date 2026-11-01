import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class CourseRepository {
  constructor(private readonly database: DatabaseService) {}

  async completedActivityIds(userId: string): Promise<string[]> {
    const rows = await this.database.client<Array<{ activity_id: string }>>`
      SELECT activity_id FROM course_progress WHERE user_id = ${userId} ORDER BY completed_at, activity_id
    `;
    return rows.map((row) => row.activity_id);
  }

  /** Idempotent: finishing an activity again keeps the first completion date. */
  async markCompleted(userId: string, activityId: string): Promise<void> {
    await this.database.client`
      INSERT INTO course_progress (user_id, activity_id) VALUES (${userId}, ${activityId})
      ON CONFLICT (user_id, activity_id) DO NOTHING
    `;
  }
}
