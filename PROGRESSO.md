# Progresso do Projeto

## Última atualização
2026-07-17 — Fases 1 a 12 e bootstrap da VPS concluídos.

## Tarefa em andamento
Nenhuma tarefa em andamento; release cumulativa publicada e validada.

## Contexto necessário
- `main` no commit `7c0117d`, com quality, database-integration e container-validation aprovados na CI `29607483626`.
- VPS de teste: `192.168.0.233`; repositório em `/home/lundy/xadrez-essencial`.
- Deploy exclusivamente por `git pull --ff-only` via `deploy/auto-deploy.sh` e timer systemd versionado a cada minuto.
- API, worker, web, PostgreSQL, Redis e Mailpit saudáveis; healthchecks externos aprovados.
- Banco com 8 migrations, 7 controles de tempo e 1 curso seed; dois backups com SHA-256 validados.
- `.env.vps` permanece fora do Git, com modo 600; nenhuma credencial foi versionada.
- `helper_files/` permanece ignorado.
- Alterações aparentes nos sete arquivos de cursos/web/contratos são preexistentes e sem diff de conteúdo; não incluí-las em commits.

## Concluído
- [x] Fases 1 a 12 implementadas, testadas e integradas em `main`.
- [x] Condição de corrida do teste realtime eliminada por correlação de `clientMoveId`.
- [x] Deploy key somente leitura, clone inicial e timer systemd configurados.
- [x] Retry do timer e espera explícita de PostgreSQL/Redis/Mailpit corrigidos.
- [x] Containers, healthchecks, carga, migrations, seed e backups validados na VPS.
- [x] Fluxo de deploy exclusivamente por Git pull comprovado de ponta a ponta.

## Próxima tarefa
Definir e priorizar o backlog da V2; `TAREFAS.md` ainda não existe.
