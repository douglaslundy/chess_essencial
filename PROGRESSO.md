# Progresso do Projeto

## Última atualização
2026-07-16 23:12:00 -03:00

## Tarefa em andamento
Infraestrutura de publicação Git e deploy automático por `git pull`. A Fase 5 foi concluída, testada e implantada; falta publicar o repositório e ativar o agendador na VPS.

## Contexto necessário
- `AGENTS.md`: regra estrutural de deploy por Git pull.
- `deploy/auto-deploy.sh` e `deploy/remote-deploy.sh`: pull bloqueado por lock e implantação local.
- `docs/DEPLOY_GIT_PULL.md`: procedimento operacional.
- `scripts/publish-deploy.ps1`: publicação da `main`.
- GitHub: repositorio privado e vazio; usar deploy key somente-leitura para o pull da VPS.
- `prompts/06_GAME_UI.md`: próxima fase, somente após concluir o bootstrap Git.

## Concluído
- [x] Fases 1 a 4 concluídas, testadas e implantadas.
- [x] Fase 5: motor puro de rating com tabela local, diferença efetiva, K 40/20/10 e arredondamento auditável.
- [x] Fase 5: filas por controle/pool, expansão bilateral, bloqueios, preferência contra repetição, cores e lock transacional.
- [x] Fase 5: desafios diretos com expiração e criação autoritativa de partida.
- [x] Fase 5: finalização atualiza rating de forma idempotente; ledger imutável e reversões explícitas.
- [x] Fase 5: histórico, leaderboard, contratos, OpenAPI, schema e documentação sincronizados.
- [x] Fase 5: format, lint, typecheck, testes locais e build aprovados.
- [x] Fase 5: 17/17 e2e aprovados em PostgreSQL temporário limpo.
- [x] Fase 5: migration 0002, rollback, reaplicação e seed verificados.
- [x] Fase 5: imagem `xadrez-essencial:phase5` saudável na VPS.
- [x] Nenhuma credencial fornecida pelo usuário foi gravada no repositório.

## Próxima tarefa
Publicar a árvore em `https://github.com/douglaslundy/chess_essencial.git`, ativar e comprovar o autopull sem transferência de código por SSH. Depois, iniciar a Fase 6 e não avançar à Fase 7 antes dos testes e critérios de aceite.
