# Progresso do Projeto

## Última atualização
2026-07-17 — bootstrap em validação; sincronização do teste realtime em correção

## Tarefa em andamento
Eliminar a condição de corrida do teste realtime, restabelecer a CI de `main` e concluir o bootstrap da VPS.

## Contexto necessário
- Branch `codex/phase12-release`, empilhada sobre a Fase 11 aprovada.
- PR #7 da Fase 12 está verde na execução `29604020077`: quality, database-integration e container-validation aprovados.
- A jornada de release cobre dois usuários, matchmaking, partida completa, resultado, rating e PGN.
- A carga local executou 80 requisições, zero falhas e p95 de 92,76 ms; a CI repetiu o gate.
- Migrations em banco limpo, seed demo opt-in, backup/restore, rollback e reaplicação foram aprovados.
- As imagens `xadrez-api`, `xadrez-worker` e `xadrez-web` foram construídas e validadas como não root.
- `helper_files/` permanece ignorado; nenhuma credencial foi versionada.
- Futuro host de deploy: `192.168.0.233`, usuário `lundy`; credencial existe apenas na memória privada do Codex.
- A release cumulativa foi integrada em `main` no commit `5e26826`; a CI de main `29604911658` passou.
- O primeiro ciclo do timer falhou sem alterar containers porque o gerenciador de usuário ainda não reconhecia o grupo Docker; o grupo foi corrigido.
- O timer com `OnUnitActiveSec` não reagendava após falha precoce; a correção com `OnCalendar` foi integrada em `main` no commit `e499bb4`.
- A primeira execução criou PostgreSQL/Redis/Mailpit, mas consultou o banco antes de aceitar conexões; o deploy passará a usar `docker compose up --wait`.
- O ajuste de prontidão foi integrado em `main` no commit `95d54e5`; a CI do PR #9 passou integralmente.
- A CI de `main` expôs uma condição de corrida em `realtime.e2e.test.ts`: o helper aceitava um `game.move_committed` atrasado de outro comando. A correção correlaciona o evento por `clientMoveId`.
- O bootstrap único usa clone e timer; todos os deploys permanecem `git pull --ff-only` por `deploy/auto-deploy.sh`.
- Alterações aparentes nos sete arquivos de cursos/web/contratos são preexistentes e sem diff de conteúdo; não incluí-las em commits.

## Concluído
- [x] Fases 1 a 12 concluídas e aprovadas.
- [x] Suíte completa, format, lint, typecheck e build aprovados.
- [x] E2E PostgreSQL com dois usuários aprovado.
- [x] Carga básica, migrations limpas e backup/restore aprovados.
- [x] Três imagens Docker e pipeline exclusivamente por Git pull aprovados.
- [x] Seed demo sem segredo versionado, runbook e checklist de produção concluídos.
- [x] Varreduras de charset, whitespace e credenciais aprovadas.

## Pendências operacionais
- [x] Integrar a cadeia de PRs aprovada em `main`.
- [ ] Executar o bootstrap único da VPS nova: deploy key, clone e timer systemd.
- [ ] Confirmar containers, healthchecks, carga e jornada crítica após o primeiro deploy.

## Próxima tarefa
Publicar a sincronização determinística do realtime, obter CI verde em `main` e validar containers, healthchecks e jornada crítica na VPS.
