# Progresso do Projeto

## Última atualização
2026-07-17 — Fase 12 concluída e aprovada localmente e na CI

## Tarefa em andamento
Nenhuma fase de desenvolvimento em andamento. As Fases 1 a 12 do blueprint estão concluídas.

## Contexto necessário
- Branch `codex/phase12-release`, empilhada sobre a Fase 11 aprovada.
- PR #7 da Fase 12 está verde na execução `29604020077`: quality, database-integration e container-validation aprovados.
- A jornada de release cobre dois usuários, matchmaking, partida completa, resultado, rating e PGN.
- A carga local executou 80 requisições, zero falhas e p95 de 92,76 ms; a CI repetiu o gate.
- Migrations em banco limpo, seed demo opt-in, backup/restore, rollback e reaplicação foram aprovados.
- As imagens `xadrez-api`, `xadrez-worker` e `xadrez-web` foram construídas e validadas como não root.
- `helper_files/` permanece ignorado; nenhuma credencial foi versionada.
- Futuro host de deploy: `192.168.0.233`, usuário `lundy`; credencial existe apenas na memória privada do Codex.
- O bootstrap único fará clone e habilitará o timer; todos os deploys serão `git pull --ff-only` por `deploy/auto-deploy.sh`.
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
- [ ] Integrar a cadeia de PRs aprovada em `main`.
- [ ] Executar o bootstrap único da VPS nova: deploy key, clone e timer systemd.
- [ ] Confirmar containers, healthchecks, carga e jornada crítica após o primeiro deploy.

## Próxima tarefa
Após autorização de integração e deploy, integrar os PRs aprovados em `main` e executar o bootstrap da VPS `192.168.0.233` sem transferência de código por SSH.
