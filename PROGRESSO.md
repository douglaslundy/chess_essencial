# Progresso do Projeto

## Última atualização
2026-07-17 01:00:00 -03:00

## Tarefa em andamento
Finalização operacional da Fase 6 — interface de partida. Implementação e critérios técnicos aprovados; deploy automático aguarda a VPS voltar à rede.

## Contexto necessário
- `main` contém a Fase 6 no merge commit `350e0b6` do PR #1.
- GitHub CI aprovado: job de qualidade e job PostgreSQL com migrations, e2e, rollback e reaplicação.
- A VPS `192.168.0.115` estava inacessível por ping e SSH em 2026-07-17 01:00 -03:00.
- Não disparar deploy por SSH. Ao voltar, o timer `xadrez-auto-deploy.timer` deve executar `deploy/auto-deploy.sh` com `git pull --ff-only`.
- Após o autopull, verificar commit remoto, `.deploy/last-successful`, serviços e healthchecks antes de iniciar a Fase 7.
- Próxima especificação: `prompts/07_HISTORY_REVIEW.md`.

## Concluído
- [x] Fases 1 a 5 concluídas, testadas e implantadas.
- [x] Repositório privado publicado em `douglaslundy/chess_essencial`, branch `main`.
- [x] Deploy key somente leitura e timer de autopull configurados na VPS.
- [x] Fase 6 implementada: shell autenticado, fila, tabuleiro responsivo, drag/click, destaques, promoção, clocks, jogadores, lances e reconexão.
- [x] Cliente gerado do OpenAPI e socket tipado com snapshot, jogadas, encerramento e ofertas de empate.
- [x] Desistência e oferta/aceite de empate persistidos com estado autoritativo, PGN, outbox, realtime e rating.
- [x] Fase 6 aprovada com format, lint, typecheck, suíte completa e build de produção.
- [x] Integração PostgreSQL aprovada no CI com migration `0003`, e2e, rollback e reaplicação.
- [x] Nenhuma credencial fornecida pelo usuário foi gravada no repositório.

## Próxima tarefa
Quando a VPS voltar à rede, comprovar o autopull e os healthchecks da Fase 6. Somente depois iniciar a Fase 7 — histórico e revisão.