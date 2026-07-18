# Migrations do banco

As migrations são executadas em ordem lexical por `pnpm --filter @xadrez/api db:migrate`.
Cada arquivo aplicado é registrado em `_xadrez_migrations` com checksum SHA-256.

O rollback remove somente a última migration aplicada:

```bash
pnpm --filter @xadrez/api db:rollback
```

`0002_matchmaking_rating.down.sql` remove índices, desafios diretos e extensões do ledger. Antes de restaurar a unicidade legada, ele descarta somente entradas explícitas de reversão; transações originais de partidas são preservadas.

`0003_game_actions.down.sql` remove as ofertas de empate persistidas. Partidas já encerradas por acordo ou desistência permanecem encerradas, pois o estado autoritativo vive em `games`.

`0004_history_review.down.sql` remove as anotações privadas de revisão. O histórico autoritativo, os lances e o PGN permanecem preservados.

`0005_course_cms.down.sql` remove papéis editoriais, snapshots, pré-requisitos e páginas-fonte do CMS. As tabelas base de cursos, módulos, aulas e etapas permanecem preservadas.

`0006_lesson_runtime.down.sql` remove o ledger de ações e os campos de snapshot usados para retomar tentativas. Cursos, aulas, etapas, matrículas e tentativas preexistentes permanecem preservados.

`0007_exercises_runtime.down.sql` removes import runs, lesson links and training sessions, then restores the base exercise tables. Existing exercises and attempts are preserved; only Phase 10 extension columns are removed.

`0008_security_observability.down.sql` remove denúncias, bloqueios direcionais, índices de auditoria e preferências adicionais de privacidade. Usuários, perfis e o histórico base de auditoria são preservados.

`0009_lesson_content_import.down.sql` removes lesson-import audit metadata and imported version snapshots, while preserving lessons, steps, source pages and user-authored lesson versions. Restore the pre-release backup for a full content rollback.

`0010_bot_games.down.sql` removes bot metadata while preserving completed and active games. The internal bot identity is removed only when it has no `game_players` references, so historical games remain reconstructable after rollback.

O rollback de `0001_base` é destrutivo e remove todas as tabelas do schema base. As extensões
`pgcrypto` e `citext` são preservadas porque podem ser compartilhadas por outros schemas.
