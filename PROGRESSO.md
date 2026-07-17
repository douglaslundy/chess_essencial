# Progresso do Projeto

## Última atualização
2026-07-17 — Fase 7 aguardando gate PostgreSQL no CI

## Tarefa em andamento
Fase 7 — histórico paginado e revisão de partidas. Implementação local concluída; migration limpa, e2e PostgreSQL, rollback e reaplicação aguardam o job dedicado do GitHub CI porque Docker não está instalado nesta estação.

## Contexto necessário
- Especificação: `prompts/07_HISTORY_REVIEW.md`.
- Implementados contratos, OpenAPI, migration `0004_history_review`, histórico filtrável/paginado, revisão por ply com FEN/SAN/PGN e anotações privadas de comentários, setas e destaques.
- Testes locais aprovados: format, lint, typecheck, unitários, build e geração OpenAPI.
- Criar PR da Fase 7 e somente aprovar a fase após os jobs `quality` e `database-integration` passarem.
- VPS `192.168.0.115` está indisponível. Não disparar deploy por SSH; quando voltar, o timer deve executar `deploy/auto-deploy.sh` com `git pull --ff-only`.

## Concluído
- [x] Fases 1 a 5 concluídas, testadas e implantadas.
- [x] Fase 6 concluída e aprovada por testes locais e CI PostgreSQL.
- [x] Implementação e validações locais da Fase 7 concluídas.
- [x] Repositório privado `douglaslundy/chess_essencial`, branch `main`.
- [x] Deploy key somente leitura e timer de autopull configurados na VPS.
- [x] Nenhuma credencial fornecida pelo usuário foi gravada no repositório.

## Pendências operacionais
- [ ] Aprovar migration/e2e/rollback da Fase 7 no GitHub CI.
- [ ] Quando a VPS voltar, comprovar autopull, commit remoto, `.deploy/last-successful`, serviços e healthchecks.
- [ ] Não transferir código nem disparar deploy via SSH.

## Próxima tarefa
Publicar o PR da Fase 7, aguardar os dois jobs do CI e corrigir qualquer falha. Só depois iniciar a Fase 8.
