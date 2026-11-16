-- Armadilhas de abertura: linhas do mesmo estudo de aberturas, marcadas como `trap`, com a ideia
-- da armadilha. As linhas normais continuam `opening` e não mudam.
ALTER TABLE opening_lines
  ADD COLUMN kind text NOT NULL DEFAULT 'opening' CHECK (kind IN ('opening', 'trap')),
  ADD COLUMN trap_idea text;
CREATE INDEX opening_lines_kind_idx ON opening_lines (kind);
