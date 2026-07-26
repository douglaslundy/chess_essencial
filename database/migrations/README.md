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

`0011_playable_challenges.down.sql` removes only the curated playable challenge catalog introduced by the matching up migration. User attempts are removed by the exercise foreign key cascade; imported book exercises remain untouched.

`0025_subscription_plans.down.sql` drops the plan/limit/subscription tables entirely (no historical data to preserve yet — subscriptions ship in this same release).

`0026_referrals.down.sql` drops the referrals table and the `referral_code` column; no historical data to preserve yet.

`0027_subscription_checkout.down.sql` deletes any `pending` (not-yet-confirmed) subscription rows before restoring the narrower status check — active/canceled/expired history is preserved.

`0024_resync_seed_demo_lesson_collision.down.sql` is a no-op: it clears a stale content-diff cache row so the next lesson import re-derives it automatically, there's nothing to restore.

`0028_game_analysis.down.sql` drops the engine post-game analysis tables entirely — derived data, recomputable by re-running the worker's analysis job, nothing to preserve.

`0029_coach_mode.down.sql` drops the `games.coach_mode` and `user_profiles.suggest_move_enabled` columns; no historical data to preserve, both default to their pre-feature behavior (false).

`0030_voice_preference.down.sql` drops `user_profiles.voice_name`; nullable with no default, so its absence is indistinguishable from "use the browser's default voice" — nothing to preserve.

`0031_review_narration_preference.down.sql` drops `user_profiles.review_narration_enabled`; defaults to false (narration off) both ways, nothing to preserve.

`0032_game_narrations.down.sql` drops `game_narrations` (derived data, recomputable by re-running the worker's narration job) and `move_narration_cache` (a reusable cross-game cache, safe to lose and rebuild on demand).

`0033_lichess_into_challenges.down.sql` just removes the `challenge` tag it added; no other data is touched, so it's fully reversible.

O rollback de `0001_base` é destrutivo e remove todas as tabelas do schema base. As extensões
`pgcrypto` e `citext` são preservadas porque podem ser compartilhadas por outros schemas.
