# Progresso do Projeto

## Última atualização

2026-07-17 — Fase 13 publicada na branch; CI, integração e deploy ainda pendentes.

## Tarefa em andamento

Fase 13 — auditoria pós-release e saneamento documental.

## Contexto necessário

- `main` no commit `d3a6803`, com `quality`, `database-integration` e `container-validation` aprovados na CI `29607483626`.
- Branch atual publicada: `codex/phase13-audit`; commits `90949db` e `0568ba9`.
- VPS de teste: `192.168.0.233`; repositório em `/home/lundy/xadrez-essencial`.
- Deploy exclusivamente por `git pull --ff-only` via `deploy/auto-deploy.sh` e timer systemd.
- API, worker, web, PostgreSQL, Redis e Mailpit estavam saudáveis na baseline; revalidar somente após merge em `main`.
- Banco auditado com 8 migrations, 7 controles de tempo, 10 módulos, 1 aula e 0/1.298 exercícios.
- `helper_files/` permanece ignorado; o JSON fonte passou na validação estática de 1.298 IDs, números, diagramas e checksums.
- O conteúdo incompleto é P1 atribuído à Fase 14 e não deve ser importado antes de concluir a Fase 13.
- Sete arquivos de cursos/web/contratos aparecem modificados sem diff de conteúdo; não incluí-los no commit.
- O teste web novo passa com config local mínima; o config oficial e a etapa final do Next build encontram bloqueio de criação de processo no sandbox Windows. A CI Linux é o gate.

## Concluído

- [x] Fases 1–12 implementadas, testadas, integradas e implantadas.
- [x] Backlog V2 criado em `TAREFAS.md` com gates das Fases 13–18.
- [x] Matriz consolidada, checklist de produção e relatório `docs/PHASE13_AUDIT.md` atualizados.
- [x] Cadastro/login web, envio SMTP, reenvio anti-enumeração e refresh automático implementados.
- [x] Contratos e frontend alinhados aos sete controles de tempo com hífen; seletor de rating sem efeito removido.
- [x] Lint e typecheck completos aprovados.
- [x] Contratos: 9 arquivos/24 testes; API direcionada: 3 arquivos/8 testes; web refresh: 1 arquivo/2 testes.
- [x] OpenAPI e cliente TypeScript regenerados.
- [x] Correções e testes versionados no commit `90949db`.
- [x] Auditoria e backlog versionados no commit `0568ba9`; branch publicada no GitHub.
- [x] `git diff --check`, varredura de charset e varredura de segredos aprovados.

## Próxima tarefa

1. Abrir o PR da Fase 13 e aguardar os três jobs da CI.
2. Corrigir qualquer falha antes de integrar.
3. Integrar em `main` e aguardar o deploy automático.
4. Validar commit, healthchecks, SMTP/Mailpit e jornada crítica na VPS.
5. Somente então marcar a Fase 13 concluída e iniciar a Fase 14.
