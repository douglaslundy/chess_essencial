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

O rollback de `0001_base` é destrutivo e remove todas as tabelas do schema base. As extensões
`pgcrypto` e `citext` são preservadas porque podem ser compartilhadas por outros schemas.
