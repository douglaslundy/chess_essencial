# Progresso do Projeto

## Última atualização
2026-07-17 — diagnóstico da segunda execução PostgreSQL da Fase 9 em andamento

## Tarefa em andamento
Fase 9 — runtime de aula interativa, conforme `prompts/09_LESSON_RUNTIME.md`.

## Contexto necessário
- Branch `codex/phase9-lesson-runtime`; PR #4.
- Runtime autoritativo em `apps/api/src/lesson-runtime/`, contratos em `packages/contracts/src/lesson-runtime.ts` e migration `0006_lesson_runtime`.
- A resposta pública expõe somente a etapa atual sanitizada; respostas e etapas futuras ficam no snapshot privado do servidor.
- Cada ação é persistida no ledger `lesson_attempt_actions`; tentativas iniciadas podem ser retomadas.
- Aula demonstrativa completa do módulo 1 criada no seed e player em `/app/aula/[lessonId]`.
- Duas execuções da PR tiveram `quality` aprovado; `database-integration` ainda retorna 500 ao montar a aula demo.
- Campos SQL opcionais já são normalizados. O filtro global agora registra somente nome/mensagem de erros 500 para revelar a causa sem expor payloads ou credenciais.
- Docker não está instalado neste Windows; a reprodução PostgreSQL continua pelo job isolado do GitHub.
- O usuário determinou continuar sem deploy. Não acessar nem modificar a VPS.

## Concluído
- [x] Fases 1 a 8 concluídas e aprovadas.
- [x] Implementação funcional da Fase 9 concluída localmente.
- [x] Gates locais aprovados: format, lint, typecheck, testes unitários, build API e build web.
- [x] Varreduras UTF-8/mojibake e secrets aprovadas; senhas encontradas são apenas fixtures de integração.
- [x] Nenhuma credencial fornecida pelo usuário foi gravada.

## Pendências
- [ ] Publicar log seguro de exceções 500 e identificar a causa restante no CI.
- [ ] Aprovar `quality` e `database-integration` antes de mesclar.
- [ ] Não executar deploy.

## Próxima tarefa
Executar novamente a PR #4, ler a exceção interna registrada e corrigir a causa; somente após os dois jobs passarem, mesclar e iniciar `prompts/10_EXERCISES_IMPORT.md`.
