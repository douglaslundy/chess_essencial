# Progresso do Projeto

## Última atualização
2026-07-17 — correção da primeira execução PostgreSQL da Fase 9 concluída

## Tarefa em andamento
Fase 9 — runtime de aula interativa, conforme `prompts/09_LESSON_RUNTIME.md`.

## Contexto necessário
- Branch `codex/phase9-lesson-runtime`; PR #4.
- Runtime autoritativo em `apps/api/src/lesson-runtime/`, contratos em `packages/contracts/src/lesson-runtime.ts` e migration `0006_lesson_runtime`.
- A resposta pública expõe somente a etapa atual sanitizada; respostas e etapas futuras ficam no snapshot privado do servidor.
- Cada ação é persistida no ledger `lesson_attempt_actions`; tentativas iniciadas podem ser retomadas.
- Aula demonstrativa completa do módulo 1 criada no seed e player em `/app/aula/[lessonId]`.
- Primeira execução da PR: `quality` passou; `database-integration` detectou 500 ao montar snapshot porque campos SQL opcionais vieram como `null`.
- Correção: normalizar `title` e `orientation` de `null` para `undefined` antes do parse Zod; validações locais passaram.
- O usuário determinou continuar sem deploy. Não acessar nem modificar a VPS.

## Concluído
- [x] Fases 1 a 8 concluídas e aprovadas.
- [x] Implementação funcional da Fase 9 concluída localmente.
- [x] Gates locais aprovados: format, lint, typecheck, testes unitários, build API e build web.
- [x] Varreduras UTF-8/mojibake e secrets aprovadas; senhas encontradas são apenas fixtures de integração.
- [x] Nenhuma credencial fornecida pelo usuário foi gravada.

## Pendências
- [ ] Reexecutar e aprovar `quality` e `database-integration` após a correção.
- [ ] Corrigir qualquer nova falha antes de mesclar.
- [ ] Não executar deploy.

## Próxima tarefa
Publicar a correção na PR #4 e acompanhar os dois jobs; somente após aprovação, mesclar e iniciar `prompts/10_EXERCISES_IMPORT.md`.
