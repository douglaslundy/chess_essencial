-- Rollback: apaga as aulas do tutor (são geradas de novo) e remove o papel de professor.
DROP TABLE IF EXISTS tutor_lessons;
DELETE FROM user_roles WHERE role = 'teacher';
ALTER TABLE user_roles DROP CONSTRAINT user_roles_role_check;
ALTER TABLE user_roles
  ADD CONSTRAINT user_roles_role_check CHECK (role IN ('admin', 'content_editor'));
