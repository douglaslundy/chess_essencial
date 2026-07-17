# Progresso do Projeto

## Última atualização
2026-07-17 — implementação da Fase 12 concluída; gates locais em validação

## Tarefa em andamento
Fase 12 — homologação e release, conforme `prompts/12_RELEASE.md`.

## Contexto necessário
- Branch `codex/phase12-release`, empilhada sobre a Fase 11 aprovada no commit `9988535`.
- PR #6 da Fase 11 está verde: quality e database-integration aprovados na execução `29601528407`.
- `helper_files/` está no `.gitignore`; dados locais não são versionados.
- A jornada `apps/api/src/release/release.e2e.test.ts` cobre dois usuários, matchmaking, partida completa, resultado, rating e PGN.
- `scripts/basic-load.mjs` executou 80 requisições, zero falhas e p95 de 92,76 ms localmente.
- Backup/restore está validável em CI pelas ferramentas do próprio container PostgreSQL 17; scripts operacionais criam checksum, retenção e confirmação explícita.
- Imagens separadas `xadrez-api`, `xadrez-worker` e `xadrez-web` usam usuário `node` e tag do commit.
- Seed demo é opt-in e exige `DEMO_USER_PASSWORD` externo; nenhuma senha foi versionada.
- Futuro host de deploy: `192.168.0.233`, usuário `lundy`; credencial existe apenas na memória privada do Codex.
- O bootstrap único fará clone e habilitará o timer; todos os deploys serão `git pull --ff-only` por `deploy/auto-deploy.sh`.
- Não tocar em `main`, não fazer merge e não executar deploy antes de todos os gates da Fase 12.
- Alterações aparentes nos sete arquivos de cursos/web/contratos são preexistentes e sem diff de conteúdo; não incluí-las nos commits.

## Concluído
- [x] Fases 1 a 11 concluídas e aprovadas.
- [x] E2E de release com dois usuários implementado.
- [x] Carga básica implementada e aprovada localmente.
- [x] Migrations limpas e backup/restore adicionados à CI.
- [x] Três imagens Docker e pipeline por Git pull finalizados.
- [x] Seed demo sem segredo versionado, runbook e checklist de produção criados.
- [x] Formatação, lint, typecheck, testes unitários da API e build aprovados localmente.

## Pendências
- [ ] Executar suíte completa local e varreduras finais.
- [ ] Commitar, publicar branch e abrir PR da Fase 12.
- [ ] Validar E2E PostgreSQL, backup/restore e imagens na CI.
- [ ] Preparar bootstrap da VPS nova sem realizar deploy antes da aprovação.

## Próxima tarefa
Concluir gates locais, revisar diff/charset/secrets e publicar a Fase 12 para validação da CI sem merge ou deploy.
