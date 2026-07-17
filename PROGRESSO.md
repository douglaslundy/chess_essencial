# Progresso do Projeto

## Última atualização
2026-07-17 — implementação e gates locais da Fase 11 aprovados; CI pendente

## Tarefa em andamento
Fase 11 — segurança e observabilidade, conforme `prompts/11_SECURITY_OBSERVABILITY.md`.

## Contexto necessário
- Branch `codex/phase11-security-observability`, empilhada sobre a Fase 10 aprovada.
- PR #5 da Fase 10 está verde e permanece sem merge para não acionar deploy.
- `helper_files/` está no `.gitignore`; JSON e schema locais não são versionados.
- Threat model e decisões de CSRF estão em `docs/SECURITY_OBSERVABILITY.md`.
- Migration `0008` adiciona preferências de privacidade, bloqueios direcionais, denúncias e índices de auditoria, com rollback documentado.
- HTTP possui headers defensivos, request ID, JSON obrigatório em mutações, body limit e rate limits; WS possui limites de payload, comandos, salas e conexões.
- Logs HTTP são estruturados; métricas Prometheus estão em `/v1/metrics`; tracing OTLP é opcional por `OTEL_EXPORTER_OTLP_ENDPOINT`.
- Contratos, OpenAPI, testes unitários e E2E foram atualizados.
- Gates locais aprovados: format, lint, typecheck, suíte completa e build. Os E2E dependentes de PostgreSQL serão executados pela CI.
- Futuro host de deploy: `192.168.0.233`, usuário `lundy`; credencial persistida apenas na memória privada do Codex. Nenhum deploy está autorizado nesta fase.
- Não tocar em `main`, não fazer merge e não executar deploy.

## Concluído
- [x] Fases 1 a 10 concluídas e aprovadas.
- [x] JSON real validado: 1.298 aceitos e 0 rejeitados.
- [x] Threat model e correções dos achados críticos implementados.
- [x] Privacidade, bloqueios, denúncias, auditoria, sanitização, rate limits, headers, limites WS, logs, métricas e OpenTelemetry implementados.
- [x] Nenhuma credencial ou arquivo de `helper_files/` foi gravado no Git.

## Pendências
- [x] Executar format, lint, typecheck, testes completos e build.
- [ ] Validar migration, rollback e E2E de segurança na CI PostgreSQL.
- [ ] Não avançar à Fase 12 antes de todos os gates e critérios de aceite.
- [ ] Manter PRs anteriores sem merge e não executar deploy.

## Próxima tarefa
Commitar e abrir PR empilhado da Fase 11; acompanhar e corrigir a CI PostgreSQL sem merge ou deploy.
