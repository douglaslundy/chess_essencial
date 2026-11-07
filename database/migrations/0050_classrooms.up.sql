-- Sala de aula: o professor cria a sala, adiciona alunos e a tela dele (live_path) é replicada nos alunos.
CREATE TABLE classrooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  live_path text NOT NULL DEFAULT '/app',
  live_seq bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX classrooms_teacher_idx ON classrooms (teacher_id);

CREATE TABLE classroom_members (
  classroom_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (classroom_id, user_id)
);
CREATE INDEX classroom_members_user_idx ON classroom_members (user_id);
