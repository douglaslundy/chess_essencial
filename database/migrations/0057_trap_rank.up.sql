-- Armadilhas ordenadas da mais efetiva (menor número) para a menos: as que terminam a partida mais rápido primeiro.
ALTER TABLE opening_lines ADD COLUMN trap_rank smallint;
