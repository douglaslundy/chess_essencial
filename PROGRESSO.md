# Progresso do Projeto

## Última atualização
2026-07-17 — Fase 9 aprovada; Fase 10 iniciada em branch isolada

## Tarefa em andamento
Fase 10 — exercícios, importador, treino e métricas, conforme `prompts/10_EXERCISES_IMPORT.md`.

## Contexto necessário
- Branch `codex/phase10-exercises-import`, empilhada sobre a Fase 9 aprovada.
- PR #4 da Fase 9 está aberta com `quality` e `database-integration` aprovados; merge em `main` foi bloqueado porque poderia acionar auto-deploy, contrariando a ordem sem deploy.
- Usar tabelas base `exercises` e `exercise_attempts`, `course/CURRICULUM_BLUEPRINT.md` e placeholders `/exercises` do OpenAPI.
- Implementar busca/filtros, sessão de treino, tentativa, dica, solução, métricas e associação a aulas.
- Validar FEN somente para `legal_position`; diagramas ilustrativos devem ser tratados sem motor de legalidade.
- Contratos de exercícios/treino e migration `0007_exercises_runtime` criados; 20 testes contratuais e typecheck aprovados.
- Importador normaliza aliases, separa diagramas ilustrativos, valida FEN legal e persiste relatorio idempotente.
- API autenticada de busca, treino, tentativa, dica, solucao e metricas implementada.
- Gates locais aprovados: format, lint, typecheck, testes de todos os workspaces e build completo.
- O arquivo `Xadrez_Essencial_Exercicios_1_a_1298.json` não foi encontrado no repositório, anexos, Desktop, Downloads, `workspace12` ou busca pública. Não inventar contagens reais.
- O usuário determinou continuar sem deploy. Não acessar nem modificar a VPS e não tocar em `main`.

## Concluído
- [x] Fases 1 a 8 concluídas e aprovadas.
- [x] Fase 9 implementada e aprovada: `database-integration` 58s e `quality` 1m36s na execução 29580519247.
- [x] Runtime de aula, migration `0006`, rollback/reaplicação e 27 integrações aprovados.
- [x] Nenhuma credencial fornecida pelo usuário foi gravada.

## Pendências
- [ ] Implementar e aprovar a Fase 10.
- [ ] Executar o import real e emitir contagens quando o JSON de 1.298 itens estiver disponível.
- [ ] Manter PR #4 sem merge enquanto `main` puder disparar deploy.
- [ ] Não executar deploy.

## Próxima tarefa
Enviar a branch isolada e aguardar quality + database-integration; corrigir qualquer falha antes de aprovar a Fase 10.
