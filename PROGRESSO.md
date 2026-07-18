# Progresso do Projeto

## Última atualização

2026-07-18 - Phase 14 completed, merged and deployed with all acceptance gates passing.
## Tarefa em andamento

Phase 15 - build a reproducible standalone TypeScript SDK and document mobile authentication/realtime.
## Contexto necessário

- Phase 14 merged through PR #14 at commit 9d8830a; PR and main CI quality, database integration and container validation passed.
- Automatic Git-pull deploy succeeded on VPS 192.168.0.233 with backup chess-20260718T030556Z.dump and image tag 9d8830ac2def.
- Production course is published with 10 modules, 119 lessons, 714 steps, 1,282 exercise links and zero unpublished lessons.
- Phase 15 acceptance: reproducible TypeScript client, non-web auth/realtime documentation, auth/reconnection contract tests and no Next.js domain dependency.
- Standalone @xadrez/sdk now provides generated OpenAPI types, REST auth/recovery methods and bounded WebSocket reconnect with canonical-version rejoin.
- Password recovery is single-use, anti-enumeration, SMTP-delivered and revokes every active session after reset.
- Local targeted formatting, SDK generation check, lint, typecheck, all tests and full monorepo build pass; database CI and deployment remain pending.
- Start from api/openapi.yaml, apps/web/package.json, apps/web/src/lib/api/openapi.d.ts, apps/api/src/auth, apps/api/src/games/presentation/games.gateway.ts, apps/api/src/games/realtime.e2e.test.ts and docs/REALTIME_PROTOCOL.md.
- Seven course/web/contract files appear modified locally without content diff; never stage them.
## Concluído

- [x] Phases 1-13 implemented, tested and deployed.
- [x] Phase 14 source PDF and canonical dataset validated: 476 pages, 119 lessons, 714 steps and 1,282 links.
- [x] Transactional/idempotent lesson import, audit, migration 0009, rollback/restore and publication gates passed.
- [x] PR #14 and main CI passed; automatic Git-pull deploy and external API/web/worker checks passed.
- [x] Production database and public course counts match the canonical dataset.
## Próxima tarefa

1. Run final diff, charset and secret scans; commit and open the Phase 15 PR.
2. Require quality, database integration and container validation to pass.
3. Merge only after CI, then verify the automatic Git-pull deploy and public recovery contract.
4. Do not start Phase 16 until Phase 15 deployment acceptance passes.
