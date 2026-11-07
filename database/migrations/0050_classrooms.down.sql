-- Rollback: apaga as salas de aula e seus alunos (nenhum outro dado depende delas).
DROP TABLE IF EXISTS classroom_members;
DROP TABLE IF EXISTS classrooms;
