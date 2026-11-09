-- Curadoria das aulas de abertura: o administrador revisa (e pode corrigir) o texto gerado pela IA.
ALTER TABLE opening_lessons
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL;
