-- Rollback: apaga as linhas de abertura, as aulas geradas (a IA gera de novo) e o progresso de repetição.
DROP TABLE IF EXISTS opening_progress;
DROP TABLE IF EXISTS opening_lessons;
DROP TABLE IF EXISTS opening_lines;
