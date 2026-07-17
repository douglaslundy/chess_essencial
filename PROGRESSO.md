# Progresso do Projeto

## Última atualização
2026-07-17 — causa raiz JSONB da Fase 9 corrigida; aguardando nova execução PostgreSQL

## Tarefa em andamento
Fase 9 — runtime de aula interativa, conforme `prompts/09_LESSON_RUNTIME.md`.

## Contexto necessário
- Branch `codex/phase9-lesson-runtime`; PR #4.
- Runtime autoritativo em `apps/api/src/lesson-runtime/`, contratos em `packages/contracts/src/lesson-runtime.ts` e migration `0006_lesson_runtime`.
- A resposta pública expõe somente a etapa atual sanitizada; respostas e etapas futuras ficam no snapshot privado do servidor.
- Cada ação é persistida no ledger `lesson_attempt_actions`; tentativas iniciadas podem ser retomadas.
- Aula demonstrativa completa do módulo 1 criada no seed e player em `/app/aula/[lessonId]`.
- Três execuções da PR tiveram `quality` aprovado. O log seguro revelou dupla serialização: arrays/objetos eram gravados como strings dentro de `jsonb`.
- Correção: `jsonValue` + `sql.json(...)` nos writes de CMS, seed e runtime; leitura do runtime tolera registros legados duplamente serializados.
- Teste unitário cobre preservação de arrays/objetos JSON e remoção de `undefined`; typecheck e testes API passaram.
- Docker não está instalado neste Windows; a reprodução PostgreSQL continua pelo job isolado do GitHub.
- O usuário determinou continuar sem deploy. Não acessar nem modificar a VPS.

## Concluído
- [x] Fases 1 a 8 concluídas e aprovadas.
- [x] Implementação funcional da Fase 9 concluída localmente.
- [x] Gates locais aprovados: format, lint, typecheck, testes unitários, build API e build web.
- [x] Varreduras UTF-8/mojibake e secrets aprovadas; senhas encontradas são apenas fixtures de integração.
- [x] Nenhuma credencial fornecida pelo usuário foi gravada.

## Pendências
- [ ] Reexecutar `quality` e `database-integration` com a correção JSONB.
- [ ] Corrigir qualquer nova falha antes de mesclar.
- [ ] Não executar deploy.

## Próxima tarefa
Publicar a correção JSONB na PR #4 e acompanhar os dois jobs; somente após aprovação, mesclar e iniciar `prompts/10_EXERCISES_IMPORT.md`.
