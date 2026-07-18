# Progresso do Projeto

## Última atualização

2026-07-17 - Phase 14 source book received; PDF validation and lesson generation started.

## Tarefa em andamento

Phase 14 - validate the ten-volume source PDF and generate schema-compliant lesson content.

## Contexto necessário

- Main commit a3e6ae8 passed CI run 29616343005 and automatic Git-pull deploy.
- VPS target remains 192.168.0.233; code delivery remains main plus deploy/auto-deploy.sh with git pull --ff-only.
- VPS has 1,298 exercises with 1,298 unique source numbers and external IDs; latest run rejected zero.
- Canonical titles for all ten modules are deployed.
- Source contains 300 diagrams; 229 exercises reference 225 distinct diagrams.
- Pre-release backup chess-20260717T220753Z.dump passed checksum, isolated restore and two reimports at a stable 1,298 count.
- Exercise API samples passed for modules 1, 5 and 10; exercise web route returned HTTP 200.
- Public course endpoint returns 404 because the course remains draft with only one demo lesson.
- Publishing requires lessons in every module and real lesson source pages.
- The lesson schema is available separately at course/lesson.schema.json.
- helper_files contains only the exercise JSON and the exercise schema; no book volumes or lesson-content JSONs were found.
- Source PDF validated: 476 pages, 10 volume boundaries, extractable text and SHA-256 5c04386a52193fb6f89b969731f307ac30c3ef08dd7ea9ebfec7a400e4c9662b.
- Canonical lesson dataset generated at database/content/Xadrez_Essencial_Aulas_1_a_119.json: 119 lessons, 714 steps, 1,282 selected exercise links and 8 engine-validated board lessons.
- Lesson schema now requires real source pages, prerequisites, 3-10 steps and explicit interaction fields; combined exercise/lesson content validation passes.
- Transactional/idempotent lesson importer, migration 0009, import audit, automated version attribution and exact exercise-link rebuild are implemented.
- Local content validation, targeted formatting, lint, typecheck, all local tests and the full monorepo build pass.
- Lesson importer database E2E is ready but cannot run locally because this Windows host has no Docker/PostgreSQL; PostgreSQL execution is required in CI.
- CI and automatic Git-pull release now import exercises, import/publish lessons and verify the public course endpoint. Phase 15 remains blocked until database CI and VPS acceptance pass.
- PR #14 first CI: quality and containers passed; database exposed three test-fixture assumptions (old source page and two FK-safe cleanup gaps). Production import itself completed before the E2E failures.
- The three CI fixture assumptions were corrected locally; API lint/typecheck, focused unit tests, content validation, formatting and diff checks pass before the retry.
- Seven course/web/contract files appear modified locally without content diff; never stage them.

## Concluído

- [x] Phases 1-13 implemented, tested and deployed.
- [x] PR #13 merged at a3e6ae8; main CI quality, database integration and containers passed.
- [x] Automatic deploy, backup, canonical validation, strict import and health/load gates passed.
- [x] Database counts, module titles, API samples and isolated restore/reimport drill passed.
- [x] Exercise import is serialized, transactional, idempotent and audit-tracked.

## Próxima tarefa

1. Validate the PDF checksum, page count, text extraction and boundaries for volumes 1 through 10.
2. Generate and validate lesson-content JSON against course/lesson.schema.json with real source pages.
3. Import, publish and test all modules before approving Phase 14.
4. Do not start Phase 15 until the full-course acceptance gate is met.
