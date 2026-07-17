# Progresso do Projeto

## Última atualização
2026-07-17 — JSON real validado; Fase 10 aguardando CI final

## Tarefa em andamento
Fase 10 — exercícios, importador, treino e métricas, conforme `prompts/10_EXERCISES_IMPORT.md`.

## Contexto necessário
- Branch `codex/phase10-exercises-import`, empilhada sobre a Fase 9 aprovada.
- PR #5: https://github.com/douglaslundy/chess_essencial/pull/5
- O diretório local `helper_files/` está no `.gitignore`; o JSON e seu schema não podem ser commitados.
- O arquivo real possui 1.298 exercícios, 300 diagramas e 10 módulos.
- Dry-run real: 1.298 importáveis, 0 rejeitados e nenhum motivo de rejeição.
- Classificação importada: 1.069 `text_only` e 229 `legal_position`; diagramas ilustrativos usam renderer sem validação de legalidade.
- Todos os 1.298 itens usam `free_text`; o servidor avalia a resposta normalizada contra a referência persistida.
- Migration `0007`, rollback, contratos, importador, APIs, OpenAPI e interface foram ajustados ao schema real.
- Gates locais aprovados: format, lint, typecheck, testes de todos os workspaces e build completo.
- Esta máquina não possui PostgreSQL, Docker ou distribuição WSL. A persistência PostgreSQL e o rollback são validados pela CI com fixture controlada.
- Não acessar a VPS, não tocar em `main` e não fazer deploy.

## Concluído
- [x] Fases 1 a 8 concluídas e aprovadas.
- [x] Fase 9 implementada e aprovada na CI 29580519247.
- [x] JSON real da Fase 10 validado integralmente: 1.298 aceitos e 0 rejeitados.
- [x] Nenhuma credencial ou arquivo de `helper_files/` foi gravado no Git.

## Pendências
- [ ] Enviar os ajustes sem o JSON e obter `quality` + `database-integration` verdes.
- [ ] Fechar a Fase 10 somente após a CI final.
- [ ] Só então ler e iniciar a Fase 11.
- [ ] Manter PRs #4 e #5 sem merge e não executar deploy.

## Próxima tarefa
Commitar apenas código e `.gitignore`, confirmar que `helper_files/` segue ignorado, enviar a branch e corrigir qualquer falha da CI antes de avançar.
