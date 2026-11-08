-- Papel de professor (o admin já tem tudo) e aulas do Tutor de IA guardadas para reuso.
ALTER TABLE user_roles DROP CONSTRAINT user_roles_role_check;
ALTER TABLE user_roles
  ADD CONSTRAINT user_roles_role_check CHECK (role IN ('admin', 'content_editor', 'teacher'));

CREATE TABLE tutor_lessons (
  content_kind text NOT NULL CHECK (content_kind IN ('library', 'exercise', 'review', 'lesson')),
  content_id text NOT NULL,
  prompt_version integer NOT NULL,
  status text NOT NULL CHECK (status IN ('generating', 'completed', 'failed')),
  frames jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_steps integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_kind, content_id, prompt_version)
);
