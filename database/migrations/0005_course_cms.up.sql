CREATE TABLE user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role varchar(30) NOT NULL CHECK (role IN ('admin', 'content_editor')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE lesson_source_pages (
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  page integer NOT NULL CHECK (page > 0),
  PRIMARY KEY (lesson_id, page)
);

CREATE TABLE lesson_prerequisites (
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  prerequisite_lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE RESTRICT,
  PRIMARY KEY (lesson_id, prerequisite_lesson_id),
  CHECK (lesson_id <> prerequisite_lesson_id)
);

CREATE TABLE lesson_versions (
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  content jsonb NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lesson_id, version)
);

CREATE INDEX idx_lesson_versions_created_at ON lesson_versions (lesson_id, created_at DESC);
