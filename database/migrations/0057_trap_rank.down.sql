-- Rollback: remove a posição das armadilhas no ranking (a lista volta à ordem por partidas jogadas).
ALTER TABLE opening_lines DROP COLUMN IF EXISTS trap_rank;
