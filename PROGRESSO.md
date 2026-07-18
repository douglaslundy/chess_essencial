# Progresso do Projeto

## Última atualização

2026-07-18 - Realtime handshake, board UX, human/bot separation and playable challenge catalog implemented on branch codex/realtime-board-challenges; full validation is in progress.
## Tarefa em andamento

Validate and deliver realtime/board fixes plus the dedicated playable Challenges area.
## Contexto necessário

- Phase 15 merged through PR #15 at commit 8d9bb94; PR/main CI and automatic Git-pull deploy passed.
- Current branch: codex/realtime-board-challenges, based on merged main f7bf942.
- Confirmed defects: menu links point to nonexistent /ranking and /cursos; no Meus dados page; sidebar has no mobile mode; exercises render FEN/text instead of ChessBoard; demo game attempts realtime lookup for id demo.
- Required bot behavior: automatic fallback when no compatible human is queued, optional difficulty/color, server-authoritative legal moves, bot games unrated.
- Mobile/portal acceptance passed locally: web TypeScript passed and 8 web tests passed, including legal moves and incomplete illustrative FEN rendering.
- New portal routes use /app/ranking, /app/cursos, /app/cursos/[slug] and /app/meus-dados; the authenticated shell provides an accessible mobile drawer.
- Demo game id demo is fully local and no longer opens API/WebSocket connections; visual exercises use ChessBoard when the canonical item has FEN.
- Migration 0010 creates the internal bot identity and game_bots metadata; rollback preserves reconstructable historical games.
- Bot moves are selected and committed only by the server, bot games are unrated, fallback is opt-in at the API and enabled by the web flow when no human is queued.
- User can choose direct bot/human fallback, matched/beginner/intermediate/advanced/expert difficulty and white/black/random pieces.
- Local gates passed: lint, typecheck, all non-database tests, OpenAPI generation/check and production build. Docker/PostgreSQL are unavailable locally, so clean migration/rollback and bot DB e2e await GitHub database-integration.
- PR #16 merged at main commit f7bf942; both PR and main runs passed quality, container-validation and database-integration, including clean migration 0010, rollback and reapply.
- No SSH deployment was used. HTTP checks to 192.168.0.233 failed because port 80 was unreachable; the VPS timer must Git-pull main when the server returns.
- Fixed the realtime race: game.join is sent only after auth.authenticated; online state starts only after game.snapshot.
- Board now restricts live input to the authenticated player's color/turn, shows external coordinates, symmetric glyph designs and explicit SAN plus from/to notation.
- Exercise boards maintain move history with Voltar lance/Repetir lance controls.
- Human matchmaking never falls back to a bot; an unmatched search leaves the queue and reports that no online opponent was found. Bot setup remains explicit.
- Ranking and play pages explain the time pools in beginner-friendly language.
- Migration 0011 seeds eight server-scored playable challenges across rating bands: mate in 1/2, save king, fork, pin, skewer, discovered attack and double check; rollback deletes only this catalog.
- Dedicated /app/desafios route selects technique/difficulty and suggests a band from the student's rating.
- Horizontal page overflow is clipped at the shell while wide ranking tables scroll only inside their card.
- All local gates passed after final formatting: lint, typecheck, all non-database tests, SDK/OpenAPI generation check and production build; /app/desafios is included in the Next production route manifest.
- Charset scan checked 27 changed/untracked files as strict UTF-8 with no BOM/mojibake; secret candidate scan and git diff --check passed.
- Docker is not installed locally. Clean migration 0011, challenge database e2e, rollback and reapply must pass GitHub database-integration before merge.
- Current validation context: package scripts, database/migrations/0011_playable_challenges.*, apps/api/src/exercises/exercises.e2e.test.ts, and files changed on this branch.
- Seven course/web/contract files appear modified locally without content diff; never stage them.
## Concluído

- [x] Phases 1-13 implemented, tested and deployed.
- [x] Phase 14 source PDF and canonical dataset validated: 476 pages, 119 lessons, 714 steps and 1,282 links.
- [x] Transactional/idempotent lesson import, audit, migration 0009, rollback/restore and publication gates passed.
- [x] PR #14 and main CI passed; automatic Git-pull deploy and external API/web/worker checks passed.
- [x] Production database and public course counts match the canonical dataset.
- [x] Phase 15 SDK/auth/realtime contracts merged, CI-approved and deployed as image 8d9bb949f612.
- [x] Corrected mobile navigation, missing Ranking/Cursos/Meus dados routes, board containment and visible text contrast.
- [x] Added board interaction to FEN-backed exercises and safe diagram rendering for illustrative positions without legal kings.
- [x] Made the demonstration board local/offline and removed its false realtime disconnect state.
- [x] Implemented legal server-authoritative bot moves, persistence, automatic matchmaking fallback, difficulty and color selection.
- [x] Updated OpenAPI/generated clients, migration rollback CI checks and bot unit/database integration coverage.
- [x] PR #16 and main CI passed all three required jobs.
- [x] Corrected WebSocket authentication ordering and live move availability.
- [x] Added visible coordinates, symmetric piece designs and explicit beginner-readable notation.
- [x] Added exercise undo/repeat controls and separated human search from explicit bot play.
- [x] Added rhythm explanations, overflow containment and the playable Challenges area.
## Próxima tarefa

1. Commit and push only intended files, then wait for quality, container-validation and database-integration.
2. Merge only after CI validates migration 0011, challenge scoring, rollback and reapply.
3. Do not deploy while the VPS is unavailable; when it returns, deployment remains Git pull only.
