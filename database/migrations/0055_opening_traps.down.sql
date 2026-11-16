-- Rollback: remove as armadilhas (e, em cascata, aulas e progresso delas) e as colunas novas.
DELETE FROM opening_lines WHERE kind = 'trap';
DROP INDEX IF EXISTS opening_lines_kind_idx;
ALTER TABLE opening_lines DROP COLUMN IF EXISTS trap_idea, DROP COLUMN IF EXISTS kind;
