# Progresso do Projeto

## Última atualização

2026-07-17 — Fase 13 concluída, integrada e validada na VPS; Fase 14 iniciada.

## Tarefa em andamento

Fase 14 — conteúdo integral do curso e exercícios.

## Contexto necessário

- Baseline: `main` no commit `aa982db`; CI `29613488363` com os três jobs aprovados.
- Deploy automático confirmado por `deploy/auto-deploy.sh`; API, worker e web healthy na VPS `192.168.0.233`.
- Jornada F13 aprovada: cadastro, Mailpit UTF-8, verificação, login, refresh, logout e reenvio anti-enumeração.
- Matchmaking aprovou os sete códigos com hífen e rejeitou o formato antigo; fila de teste removida.
- Fonte ignorada: `helper_files/Xadrez_Essencial_Exercicios_1_a_1298.json`.
- Validação estática da fonte: 10 módulos, 300 diagramas, 1.298 exercícios, IDs/números únicos, zero referências ausentes e zero checksums inválidos.
- Estado atual do banco: 10 módulos, 1 aula demo, 0 exercícios e 0 vínculos aula-exercício.
- Contexto de código inicial: `apps/api/src/database/import-exercises.ts`, `apps/api/src/exercises/exercise-importer.ts`, contratos de exercícios e migrations.
- Não escrever no banco da VPS antes de aprovar dry-run, testes, backup e rollback.
- Dry-run real aprovado: 1.298 importados, zero rejeitados.
- Dataset canônico copiado para database/content; helper_files continua ignorado.
- Importer integration test now covers idempotency, remapping and transactional rollback.
- Deploy e CI passam a importar a fonte canônica versionada; nenhuma escrita foi feita na VPS até os gates serem aprovados.
- PR #13 first run: quality and containers passed; database job exposed a package-relative content path.
- Import CLI now resolves input from repository root; compiled dry-run passed from apps/api.
- PR #13 CI run 29616080467 passed quality, database integration and container validation.
- Sete arquivos de cursos/web/contratos aparecem modificados localmente sem diff de conteúdo; não incluí-los em commits.

## Concluído

- [x] Fases 1–12 implementadas, testadas e implantadas.
- [x] Fase 13 auditada; matriz, checklist e backlog V2 atualizados.
- [x] P1 de autenticação, sessão e controles de tempo corrigidos.
- [x] PR #12 integrado em `aa982db`; CI de PR e de `main` aprovadas.
- [x] Deploy por Git pull, backup, migrations, seed, healthchecks e carga aprovados.
- [x] Jornada funcional F13 e SMTP/Mailpit validados externamente.
- [x] Canonical validator and strict dry-run approved for all 1,298 exercises.
- [x] Local lint, typecheck, API build and API tests approved (6 files, 19 tests).
- [x] Full web build compiled and typechecked; final worker spawn remains blocked by Windows sandbox EPERM.

## Próxima tarefa

1. Commit and publish the Phase 14 branch, then require all three CI jobs.
2. Fix any CI failure before merge; database integration is the PostgreSQL gate.
3. Merge only after approval and wait for the automatic Git-pull deploy.
4. Validate VPS counts, source IDs, module titles, API/UI samples and a second import.
5. Prove restore/reimport and only then close Phase 14.
