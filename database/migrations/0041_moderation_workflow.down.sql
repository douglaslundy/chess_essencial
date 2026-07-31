DROP INDEX IF EXISTS moderation_report_events_report_idx;
DROP TABLE IF EXISTS moderation_report_events;

ALTER TABLE moderation_reports
  DROP COLUMN IF EXISTS resolved_at,
  DROP COLUMN IF EXISTS resolved_by,
  DROP COLUMN IF EXISTS resolution;
