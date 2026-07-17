# Checklist de produção

## Antes de publicar

- [ ] PR da fase aprovado; `quality`, `database-integration` e `container-validation` verdes.
- [ ] `git diff --check`, formatação, lint, typecheck, testes e build aprovados.
- [ ] Varreduras de charset, segredos e arquivos auxiliares sem achados.
- [ ] Migration aplicada em banco limpo, rollback mais recente e reaplicação aprovados.
- [ ] E2E de dois usuários conclui cadastro, matchmaking, partida, rating e PGN.
- [ ] Carga básica possui zero falhas e p95 dentro do limite.
- [ ] Backup/restore reproduz contagens de migrations, controles de tempo e cursos.
- [ ] Imagens `api`, `worker` e `web` executam como usuário não root.
- [ ] OpenAPI e documentação atualizados quando houver mudança de contrato.

## Infraestrutura

- [ ] Host, DNS/URLs e portas conferidos sem credenciais em arquivos versionados.
- [ ] Deploy key somente leitura instalada e `origin/main` acessível.
- [ ] Docker Compose v2, espaço em disco e relógio UTC verificados.
- [ ] Timer systemd habilitado com linger para `lundy`.
- [ ] `.env.vps` com permissão restrita e segredos aleatórios.
- [ ] Volumes persistentes de PostgreSQL e Redis existentes.
- [ ] Diretório de backup restrito, checksum e retenção verificados.
- [ ] Seed demo desabilitado em produção; senha demo fornecida fora do Git em homologação.

## Depois de publicar

- [ ] Commit implantado coincide com `.deploy/last-successful-commit`.
- [ ] API, worker e web estão healthy.
- [ ] Migration esperada consta em `schema_migrations`.
- [ ] Carga HTTP automática do deploy passou.
- [ ] Login, matchmaking de dois usuários, partida e histórico validados.
- [ ] Métricas acessíveis somente com token e logs sem dados sensíveis.
- [ ] Backup anterior à migration existe e o checksum é válido.
- [ ] Plano de rollback por novo commit em `main` está disponível.
