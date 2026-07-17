# Progresso do Projeto

## Última atualização
2026-07-17 — Fase 8 aguardando gate PostgreSQL no CI

## Tarefa em andamento
Fase 8 — cursos e CMS. Implementação e gates locais concluídos. O primeiro CI aprovou qualidade, migration e e2e PostgreSQL, mas falhou apenas na asserção do rollback. A correção foi enviada no commit `c68b82b`; a nova execução aguarda confirmação porque a consulta externa atingiu o limite de uso do Codex.

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
- [ ] Confirmar a nova execução dos jobs `quality` e `database-integration` após `c68b82b`.
- [ ] Não executar deploy.

## Próxima tarefa
Consultar os checks do PR #3 quando o acesso externo voltar. Se ambos passarem, atualizar este arquivo, mesclar sem deploy e iniciar a Fase 9. Não avançar antes dessa confirmação.
