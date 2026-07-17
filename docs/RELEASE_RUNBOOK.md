# Runbook de release

## Regra de entrega

O GitHub `douglaslundy/chess_essencial` é a única origem de código. Depois que os gates da fase estiverem verdes, a mudança entra em `main`; a VPS consulta `origin/main` e executa `git pull --ff-only` por `deploy/auto-deploy.sh`. Não se transfere código com SSH, SCP, tar ou `docker cp`, e uma sessão SSH não dispara deploy.

## Bootstrap único da VPS de teste

Destino atual: `192.168.0.233`, usuário `lundy`. A senha não pertence ao repositório nem aos logs.

Pré-requisitos: Git, Docker Engine com Compose v2, OpenSSL, curl, `flock`, systemd de usuário e uma deploy key do GitHub somente leitura. No bootstrap, SSH serve apenas para preparar o host:

```bash
git clone github-xadrez:douglaslundy/chess_essencial.git /home/lundy/xadrez-essencial
cd /home/lundy/xadrez-essencial
git checkout main
mkdir -p /home/lundy/.config/systemd/user
ln -sfn /home/lundy/xadrez-essencial/deploy/systemd/xadrez-auto-deploy.service /home/lundy/.config/systemd/user/xadrez-auto-deploy.service
ln -sfn /home/lundy/xadrez-essencial/deploy/systemd/xadrez-auto-deploy.timer /home/lundy/.config/systemd/user/xadrez-auto-deploy.timer
systemctl --user daemon-reload
systemctl --user enable --now xadrez-auto-deploy.timer
```

Um administrador do host executa uma única vez `loginctl enable-linger lundy`. O timer fará o primeiro build, criará os volumes/containers e gravará o commit aprovado; não execute `remote-deploy.sh` manualmente.

## Conteúdo de uma release

- imagens separadas e não root: `xadrez-api`, `xadrez-worker` e `xadrez-web`, marcadas com o SHA curto;
- PostgreSQL e Redis com volumes persistentes;
- backup automático antes de migrations em bancos já inicializados;
- migrations e seed base idempotentes;
- seed demo desativado por padrão e protegido por segredo externo;
- healthchecks de API, worker e web, seguidos de carga HTTP básica.

Para habilitar contas demo apenas em homologação, defina em `.env.vps`:

```dotenv
DEMO_SEED_ENABLED=true
DEMO_USER_PASSWORD=<segredo-fornecido-fora-do-git>
```

As identidades são `demo_brancas` e `demo_pretas`. A senha nunca é impressa ou versionada.

## Verificação operacional

```bash
systemctl --user status xadrez-auto-deploy.timer
systemctl --user status xadrez-auto-deploy.service
tail -n 100 /home/lundy/xadrez-essencial/.deploy/auto-deploy.log
docker compose --project-name xadrez-essencial --file deploy/docker-compose.vps.yml --env-file .env.vps ps
```

Validar externamente:

- API: `http://192.168.0.233:4100/v1/health`;
- worker: `http://192.168.0.233:4101/health`;
- web: `http://192.168.0.233:3100/api/health`.

## Backup e restore

Backups ficam em `.deploy/backups`, possuem SHA-256, permissão restrita e retenção padrão de 14 dias. Backup manual permitido para operação de dados:

```bash
bash deploy/backup-database.sh
```

Restore substitui o banco e exige confirmação explícita. Faça uma cópia adicional e registre o incidente antes de executar:

```bash
RESTORE_CONFIRM=replace-xadrez-essencial-database \
  bash deploy/restore-database.sh .deploy/backups/chess-AAAAMMDDTHHMMSSZ.dump
```

## Falha e rollback

Se build, migration, healthcheck ou carga falhar, o marcador de sucesso não avança e o timer tentará novamente. Investigue o log sem editar código na VPS. Para rollback de código, reverta o commit no GitHub, aprove os gates e publique o novo commit em `main`; o mesmo fluxo por Git pull aplica a reversão. Use restore de banco somente quando a migration não puder ser corrigida por nova migration ou rollback documentado.

## Incidente

1. Registrar commit, horário, sintomas e serviços afetados.
2. Consultar logs por nome de serviço sem expor `.env.vps`.
3. Preservar backup e checksum anteriores à migration.
4. Corrigir no repositório, executar a CI e seguir o fluxo normal.
5. Confirmar healthchecks, carga básica e jornada crítica após recuperação.
