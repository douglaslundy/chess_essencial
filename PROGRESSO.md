# Progresso do Projeto

## Última atualização

2026-07-18 - Mobile/portal defects and authoritative bot completed locally; full local lint, typecheck, tests and production build passed.
## Tarefa em andamento

Correct mobile navigation, missing pages, board UX, visual exercises, lesson demo and add server-authoritative bot play.
## Contexto necessário

- Phase 15 merged through PR #15 at commit 8d9bb94; PR/main CI and automatic Git-pull deploy passed.
- Current branch: codex/mobile-ux-bot, based on origin/main 8d9bb94.
- Confirmed defects: menu links point to nonexistent /ranking and /cursos; no Meus dados page; sidebar has no mobile mode; exercises render FEN/text instead of ChessBoard; demo game attempts realtime lookup for id demo.
- Required bot behavior: automatic fallback when no compatible human is queued, optional difficulty/color, server-authoritative legal moves, bot games unrated.
- Mobile/portal acceptance passed locally: web TypeScript passed and 8 web tests passed, including legal moves and incomplete illustrative FEN rendering.
- New portal routes use /app/ranking, /app/cursos, /app/cursos/[slug] and /app/meus-dados; the authenticated shell provides an accessible mobile drawer.
- Demo game id demo is fully local and no longer opens API/WebSocket connections; visual exercises use ChessBoard when the canonical item has FEN.
- Migration 0010 creates the internal bot identity and game_bots metadata; rollback preserves reconstructable historical games.
- Bot moves are selected and committed only by the server, bot games are unrated, fallback is opt-in at the API and enabled by the web flow when no human is queued.
- User can choose direct bot/human fallback, matched/beginner/intermediate/advanced/expert difficulty and white/black/random pieces.
- Local gates passed: lint, typecheck, all non-database tests, OpenAPI generation/check and production build. Docker/PostgreSQL are unavailable locally, so clean migration/rollback and bot DB e2e await GitHub database-integration.
- Start from apps/web/src/app/app/layout.tsx, apps/web/src/app/globals.css, apps/web/src/components/game, apps/web/src/components/exercises, apps/web/src/components/lessons, apps/api/src/matchmaking and apps/api/src/games.
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
## Próxima tarefa

1. Run charset/secrets/diff gates, stage only intentional files and commit the logical delivery.
2. Push branch and require quality, container-validation and database-integration CI to pass before merge.
3. Deploy only after merge to main through the VPS Git-pull timer; never trigger deploy through SSH.
