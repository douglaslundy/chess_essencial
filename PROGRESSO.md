# Progresso do Projeto

## Última atualização
2026-07-17 — implementação local da Fase 9 concluída; aguardando validação PostgreSQL no CI

## Tarefa em andamento
Fase 9 — runtime de aula interativa, conforme `prompts/09_LESSON_RUNTIME.md`.

## Contexto necessário
- Branch `codex/phase9-lesson-runtime`.
- Runtime autoritativo em `apps/api/src/lesson-runtime/`, contratos em `packages/contracts/src/lesson-runtime.ts` e migration `0006_lesson_runtime`.
- A resposta pública expõe somente a etapa atual sanitizada; respostas e etapas futuras ficam no snapshot privado do servidor.
- Cada ação é persistida no ledger `lesson_attempt_actions`; tentativas iniciadas podem ser retomadas.
- Aula demonstrativa completa do módulo 1 criada no seed e player em `/app/aula/[lessonId]`.
- OpenAPI, cliente web gerado, testes contratuais e e2e foram atualizados.
- Gates locais aprovados: format, lint, typecheck, testes unitários, build API e build web de produção.
- O usuário determinou continuar sem deploy. Não acessar nem modificar a VPS.

## Concluído
- [x] Fases 1 a 8 concluídas e aprovadas.
- [x] Implementação funcional da Fase 9 concluída localmente.
- [x] Varreduras UTF-8/mojibake e secrets aprovadas; senhas encontradas são apenas fixtures de integração.
- [x] Nenhuma credencial fornecida pelo usuário foi gravada.

## Pendências
- [ ] Executar e aprovar os jobs `quality` e `database-integration` da Fase 9.
- [ ] Corrigir qualquer falha do CI antes de mesclar.
- [ ] Não executar deploy.

## Próxima tarefa
Commitar e publicar a branch, abrir PR da Fase 9 e acompanhar os dois jobs; somente após aprovação, mesclar e iniciar `prompts/10_EXERCISES_IMPORT.md`.
