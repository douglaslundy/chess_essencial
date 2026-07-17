# Progresso do Projeto

## Última atualização
2026-07-17 — Fase 8 aguardando gate PostgreSQL no CI

## Tarefa em andamento
Fase 8 — cursos e CMS. Implementação e gates locais concluídos; migration limpa, e2e PostgreSQL, rollback e reaplicação aguardam o CI.

## Contexto necessário
- Especificação: `prompts/08_COURSE_CMS.md`.
- Implementados contratos do schema de aula, API pública/editorial, papéis admin/editor, páginas-fonte, pré-requisitos, snapshots por versão, publicação transacional, seed dos 10 módulos e editor web com preview.
- Gates locais aprovados: geração OpenAPI, format, lint, typecheck, testes e build.
- Não há Docker local; usar o job `database-integration` do PR para migration `0005`, e2e do CMS, rollback e reaplicação.
- O usuário determinou continuar sem deploy. Não acessar nem modificar a VPS.

## Concluído
- [x] Fases 1 a 7 concluídas e aprovadas.
- [x] Implementação e validações locais da Fase 8 concluídas.
- [x] Nenhuma credencial fornecida pelo usuário foi gravada.

## Pendências
- [ ] Aprovar jobs `quality` e `database-integration` da Fase 8.
- [ ] Não executar deploy.

## Próxima tarefa
Publicar o PR da Fase 8, corrigir eventuais falhas do CI e mesclar somente após ambos os jobs passarem. Depois ler `prompts/09_LESSON_RUNTIME.md` e iniciar a Fase 9.
