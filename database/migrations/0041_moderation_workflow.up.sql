ALTER TABLE moderation_reports
  ADD COLUMN resolution text,
  ADD COLUMN resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN resolved_at timestamptz;

CREATE TABLE moderation_report_events (
  id bigserial PRIMARY KEY,
  report_id uuid NOT NULL REFERENCES moderation_reports(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  from_status varchar(20),
  to_status varchar(20) NOT NULL,
  note varchar(1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT moderation_report_events_status_check
    CHECK (
      (from_status IS NULL OR from_status IN ('open', 'reviewing', 'resolved', 'dismissed'))
      AND to_status IN ('open', 'reviewing', 'resolved', 'dismissed')
    )
);

INSERT INTO moderation_report_events (report_id, from_status, to_status, note, created_at)
SELECT id, NULL, status, 'Denúncia existente antes do workflow administrativo', created_at
FROM moderation_reports;

CREATE INDEX moderation_report_events_report_idx
  ON moderation_report_events (report_id, created_at, id);
