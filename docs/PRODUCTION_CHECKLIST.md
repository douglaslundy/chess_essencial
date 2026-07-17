# Checklist de produção

Atualização: 2026-07-17. Evidências detalhadas em `docs/PHASE13_AUDIT.md`.

## Baseline implantada em main

- [x] `quality`, `database-integration` e `container-validation` aprovados na release anterior.
- [x] Formatação, lint, typecheck, testes, build e varreduras aprovados antes da integração.
- [x] Oito migrations aplicadas; banco limpo, rollback mais recente e reaplicação cobertos pela CI.
- [x] E2E de dois usuários cobre cadastro, matchmaking, partida, rating e PGN com fixtures controladas.
- [x] Carga básica aprovada sem falhas.
- [x] Backup/restore reproduz contagens e checksum.
- [x] Imagens api, worker e web executam como usuário `node`.
- [x] Deploy key somente leitura, Compose v2, timer com linger e volumes persistentes verificados.
- [x] `.env.vps` restrito e fora do Git; seed demo desabilitado por padrão.
- [x] Commit implantado, migrations, healthchecks, carga, métricas protegidas e backups validados na VPS.
- [x] Rollback ocorre por novo commit aprovado em `main`, nunca por edição direta na VPS.

## Gate da Fase 13

- [x] Contratos, API e web passam no typecheck local.
- [x] Testes de contratos: 9 arquivos e 24 testes.
- [x] Testes direcionados de autenticação/API: 3 arquivos e 8 testes.
- [x] OpenAPI e cliente TypeScript regenerados.
- [x] Cadastro/login web, SMTP, reenvio de verificação e refresh automático implementados.
- [x] Códigos de matchmaking alinhados ao seed.
- [x] Teste web de refresh aprovado: 1 arquivo e 2 testes com config local mínima.
- [x] Formatação, lint, testes completos e build aprovados pela CI Linux.
- [x] Três jobs aprovados no PR e novamente em `main` na CI `29613488363`.
- [x] Merge em `main` e deploy automático por `git pull --ff-only` concluídos.
- [x] Healthchecks, commit, SMTP/Mailpit, autenticação e matchmaking revalidados na VPS.

## Pendências que bloqueiam declarações futuras

- [ ] Conteúdo integral: VPS ainda possui 1 aula e 0/1.298 exercícios; gate da F14.
- [ ] Produção pública: substituir relay SMTP simples por TLS/autenticação; gate da F17.
- [ ] Acessibilidade formal em teclado, leitor de tela, contraste e viewports; gate da F16.
- [ ] Restore drill operacional periódico e teste de expiração da retenção; gate da F17.
