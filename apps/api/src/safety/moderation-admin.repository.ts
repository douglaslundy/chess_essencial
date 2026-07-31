import type {
  ModerateReportInput,
  ModerationQueueQuery,
  ModerationReportStatus,
} from '@xadrez/contracts';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { toIsoString, toIsoStringOrNull } from '../common/dates/to-iso-string.js';
import { DatabaseService } from '../database/database.service.js';

type ReportRow = {
  category: string;
  created_at: Date | string;
  description: string | null;
  game_id: string | null;
  id: string;
  overdue: boolean;
  reported_display_name: string | null;
  reported_user_id: string | null;
  reported_username: string | null;
  reporter_display_name: string;
  reporter_user_id: string;
  reporter_username: string;
  resolution: string | null;
  resolved_at: Date | string | null;
  resolved_by: string | null;
  resolved_by_username: string | null;
  sla_due_at: Date | string;
  status: ModerationReportStatus;
  updated_at: Date | string;
};

@Injectable()
export class ModerationAdminRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(query: ModerationQueueQuery) {
    const sql = this.database.client;
    const status = query.status ?? null;
    const [count] = await sql<{ total: number }[]>`
      SELECT count(*)::integer AS total
      FROM moderation_reports
      WHERE (${status}::text IS NULL OR status = ${status})
    `;
    const rows = await sql<ReportRow[]>`
      SELECT mr.id, mr.category, mr.description, mr.status, mr.game_id,
             mr.resolution, mr.resolved_by, mr.resolved_at, mr.created_at, mr.updated_at,
             reporter.id AS reporter_user_id, reporter.username::text AS reporter_username,
             reporter_profile.display_name AS reporter_display_name,
             reported.id AS reported_user_id, reported.username::text AS reported_username,
             reported_profile.display_name AS reported_display_name,
             reviewer.username::text AS resolved_by_username,
             mr.created_at + interval '72 hours' AS sla_due_at,
             (mr.status IN ('open', 'reviewing') AND now() > mr.created_at + interval '72 hours') AS overdue
      FROM moderation_reports mr
      JOIN users reporter ON reporter.id = mr.reporter_user_id
      JOIN user_profiles reporter_profile ON reporter_profile.user_id = reporter.id
      LEFT JOIN users reported ON reported.id = mr.reported_user_id
      LEFT JOIN user_profiles reported_profile ON reported_profile.user_id = reported.id
      LEFT JOIN users reviewer ON reviewer.id = mr.resolved_by
      WHERE (${status}::text IS NULL OR mr.status = ${status})
      ORDER BY
        CASE mr.status WHEN 'open' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END,
        mr.created_at
      LIMIT ${query.limit} OFFSET ${query.offset}
    `;
    return { items: rows.map((row) => this.toReport(row)), total: count?.total ?? 0 };
  }

  async detail(reportId: string) {
    const row = await this.reportRow(reportId);
    const history = await this.database.client<
      {
        actor_user_id: string | null;
        actor_username: string | null;
        created_at: Date | string;
        from_status: ModerationReportStatus | null;
        id: number;
        note: string | null;
        to_status: ModerationReportStatus;
      }[]
    >`
      SELECT event.id, event.actor_user_id, actor.username::text AS actor_username,
             event.from_status, event.to_status, event.note, event.created_at
      FROM moderation_report_events event
      LEFT JOIN users actor ON actor.id = event.actor_user_id
      WHERE event.report_id = ${reportId}
      ORDER BY event.created_at, event.id
    `;
    return {
      ...this.toReport(row),
      history: history.map((event) => ({
        actor: event.actor_user_id
          ? { id: event.actor_user_id, username: event.actor_username }
          : null,
        createdAt: toIsoString(event.created_at),
        fromStatus: event.from_status,
        id: event.id,
        note: event.note,
        toStatus: event.to_status,
      })),
    };
  }

  async moderate(actorUserId: string, reportId: string, input: ModerateReportInput) {
    await this.database.client.begin(async (transaction) => {
      const [current] = await transaction<{ status: ModerationReportStatus }[]>`
        SELECT status FROM moderation_reports WHERE id = ${reportId} FOR UPDATE
      `;
      if (!current) throw new NotFoundException('Denúncia não encontrada');
      if (current.status === 'resolved' || current.status === 'dismissed') {
        throw new ConflictException('Denúncia já encerrada');
      }
      if (current.status === input.status) {
        throw new ConflictException('Denúncia já está neste estado');
      }
      const terminal = input.status === 'resolved' || input.status === 'dismissed';
      await transaction`
        UPDATE moderation_reports
        SET status = ${input.status},
            resolution = ${terminal ? (input.note ?? null) : null},
            resolved_by = ${terminal ? actorUserId : null},
            resolved_at = ${terminal ? new Date() : null},
            updated_at = now()
        WHERE id = ${reportId}
      `;
      await transaction`
        INSERT INTO moderation_report_events (
          report_id, actor_user_id, from_status, to_status, note
        ) VALUES (
          ${reportId}, ${actorUserId}, ${current.status}, ${input.status}, ${input.note ?? null}
        )
      `;
      await transaction`
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
        VALUES (
          ${actorUserId}, 'moderation.report_status_updated', 'moderation_report', ${reportId},
          ${JSON.stringify({ fromStatus: current.status, toStatus: input.status })}::jsonb
        )
      `;
    });
    return this.detail(reportId);
  }

  private async reportRow(reportId: string): Promise<ReportRow> {
    const [row] = await this.database.client<ReportRow[]>`
      SELECT mr.id, mr.category, mr.description, mr.status, mr.game_id,
             mr.resolution, mr.resolved_by, mr.resolved_at, mr.created_at, mr.updated_at,
             reporter.id AS reporter_user_id, reporter.username::text AS reporter_username,
             reporter_profile.display_name AS reporter_display_name,
             reported.id AS reported_user_id, reported.username::text AS reported_username,
             reported_profile.display_name AS reported_display_name,
             reviewer.username::text AS resolved_by_username,
             mr.created_at + interval '72 hours' AS sla_due_at,
             (mr.status IN ('open', 'reviewing') AND now() > mr.created_at + interval '72 hours') AS overdue
      FROM moderation_reports mr
      JOIN users reporter ON reporter.id = mr.reporter_user_id
      JOIN user_profiles reporter_profile ON reporter_profile.user_id = reporter.id
      LEFT JOIN users reported ON reported.id = mr.reported_user_id
      LEFT JOIN user_profiles reported_profile ON reported_profile.user_id = reported.id
      LEFT JOIN users reviewer ON reviewer.id = mr.resolved_by
      WHERE mr.id = ${reportId}
    `;
    if (!row) throw new NotFoundException('Denúncia não encontrada');
    return row;
  }

  private toReport(row: ReportRow) {
    return {
      category: row.category,
      createdAt: toIsoString(row.created_at),
      description: row.description,
      gameId: row.game_id,
      id: row.id,
      overdue: row.overdue,
      reportedUser: row.reported_user_id
        ? {
            displayName: row.reported_display_name,
            id: row.reported_user_id,
            username: row.reported_username,
          }
        : null,
      reporter: {
        displayName: row.reporter_display_name,
        id: row.reporter_user_id,
        username: row.reporter_username,
      },
      resolution: row.resolution,
      resolvedAt: toIsoStringOrNull(row.resolved_at),
      resolvedBy: row.resolved_by
        ? { id: row.resolved_by, username: row.resolved_by_username }
        : null,
      slaDueAt: toIsoString(row.sla_due_at),
      status: row.status,
      updatedAt: toIsoString(row.updated_at),
    };
  }
}
