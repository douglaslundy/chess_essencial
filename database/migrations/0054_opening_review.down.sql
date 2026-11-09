-- Rollback: remove a marca de revisão (os textos das aulas permanecem).
ALTER TABLE opening_lessons DROP COLUMN IF EXISTS reviewed_by, DROP COLUMN IF EXISTS reviewed_at;
