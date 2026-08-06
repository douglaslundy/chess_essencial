# Runbook de release

## Regra de entrega

O GitHub `douglaslundy/chess_essencial` é a única origem de código. A mudança entra em `main`, mas só fica promovida quando os três jobs obrigatórios da CI passam e o job final avança `deploy/approved` para o mesmo SHA. A VPS exige igualdade exata entre essa referência e `origin/main` antes de executar `git pull --ff-only` por `deploy/auto-deploy.sh`. Não se transfere código com SSH, SCP, tar ou `docker cp`, e uma sessão SSH não dispara deploy.

## Bootstrap único da VPS de teste

O endereço e as credenciais do destino são configurados fora do repositório e não pertencem aos logs.

Pré-requisitos: Git, Docker Engine com Compose v2, OpenSSL, curl, `flock`, Restic, systemd de usuário e uma deploy key do GitHub somente leitura. No bootstrap, SSH serve apenas para preparar o host:

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

Um administrador do host executa uma única vez `loginctl enable-linger lundy`. A referência remota `deploy/approved` deve existir e apontar para o mesmo commit de `main`; ela é criada exclusivamente pela CI verde. O timer fará o primeiro build, criará os volumes/containers e gravará o commit aprovado; não execute `remote-deploy.sh` manualmente.

## Conteúdo de uma release

- imagens separadas e não root: `xadrez-api`, `xadrez-worker` e `xadrez-web`, marcadas com o SHA curto;
- host compartilhado protegido: a limpeza remove somente imagens `xadrez-*` sem uso, nunca executa prune global ou de volumes e falha antes do build quando houver menos de 12 GiB livres;
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

- API: `http://<host-deploy>:4100/v1/health`;
- worker: `http://<host-deploy>:4101/health`;
- web: `http://<host-deploy>:3100/api/health`.

## Backup externo criptografado e restore

Antes de cada migration em um banco inicializado, `deploy/backup-database.sh` cria um dump custom do PostgreSQL e um SHA-256 portável. Em seguida, `deploy/offsite-backup.sh` empacota os dois arquivos e exige que o Restic conclua a cópia criptografada fora da VPS. Falha de ferramenta, credencial, rede, integridade ou retenção interrompe o deploy antes da migration. O repositório remoto nunca deve usar credenciais embutidas na URL.

Política padrão por host/tag: 14 pontos diários, 8 semanais e 12 mensais. Os dumps locais continuam em `.deploy/backups`, com permissão `0600` e retenção de 14 dias; eles não substituem a cópia externa.

### Configuração inicial

Use um bucket/conta dedicado fora da VPS. S3 compatível é o backend recomendado; B2, SFTP e demais backends do Restic também são aceitos. Instale o Restic pelo gerenciador de pacotes da distribuição e crie o arquivo de senha fora do checkout:

```bash
install -d -m 700 /home/lundy/.config/xadrez
umask 077
openssl rand -base64 48 > /home/lundy/.config/xadrez/restic-password
chmod 600 /home/lundy/.config/xadrez/restic-password
```

Configure `.env.vps` sem versionar valores reais:

```dotenv
RESTIC_REPOSITORY=s3:https://s3.example.com/xadrez-backups
RESTIC_PASSWORD_FILE=/home/lundy/.config/xadrez/restic-password
AWS_ACCESS_KEY_ID=<fornecido-fora-do-git>
AWS_SECRET_ACCESS_KEY=<fornecido-fora-do-git>
XADREZ_RESTIC_HOST=xadrez-production
XADREZ_RESTIC_KEEP_DAILY=14
XADREZ_RESTIC_KEEP_WEEKLY=8
XADREZ_RESTIC_KEEP_MONTHLY=12
```

Inicialize uma única vez e confirme o acesso antes de liberar o primeiro deploy com essa regra:

```bash
set -a
source .env.vps
set +a
restic init
restic check
```

Perder a senha do Restic torna os backups irrecuperáveis. Guarde uma cópia da senha e das credenciais do storage em cofre separado da VPS e teste esse acesso periodicamente.

### Backup e recuperação

Backup manual permitido para operação de dados:

```bash
bash deploy/backup-database.sh
```

Para um desastre da VPS, configure as mesmas variáveis Restic em um host limpo, recupere o snapshot e use o caminho impresso por `offsite_restore.file`:

```bash
bash deploy/fetch-offsite-backup.sh latest
RESTORE_CONFIRM=replace-xadrez-essencial-database \
  bash deploy/restore-database.sh .deploy/backups/offsite-restore-AAAAMMDDTHHMMSSZ/chess-AAAAMMDDTHHMMSSZ.dump
```

O fetch só grava dentro de `.deploy/backups`, exige diretório vazio e valida o checksum antes de liberar o arquivo. O restore destrutivo continua exigindo confirmação explícita. Para recuperar uma versão específica, passe o ID do snapshot no lugar de `latest`.

### Verificação e retenção

A CI cria um repositório Restic isolado, prova que uma senha incorreta não abre o repositório, executa `check --read-data`, remove o dump local, baixa a cópia criptografada e restaura o PostgreSQL em outro banco, comparando contagens críticas. Em operação, execute mensalmente `restic check --read-data-subset=10%` e trimestralmente uma restauração em ambiente isolado; registre data, snapshot e resultado sem registrar credenciais.

## Falha e rollback

Se a CI estiver pendente/vermelha, `deploy/approved` estiver ausente ou divergir de `main`, o checkout não avança. Se build, migration, healthcheck ou carga falhar depois da promoção, o marcador de sucesso não avança e o timer tentará novamente. Investigue o log sem editar código na VPS. Para rollback de código, reverta o commit no GitHub, aprove os gates e publique o novo commit em `main`; o mesmo fluxo por Git pull aplica a reversão. Use restore de banco somente quando a migration não puder ser corrigida por nova migration ou rollback documentado.

## Incidente

1. Registrar commit, horário, sintomas e serviços afetados.
2. Consultar logs por nome de serviço sem expor `.env.vps`.
3. Preservar backup e checksum anteriores à migration.
4. Corrigir no repositório, executar a CI e seguir o fluxo normal.
5. Confirmar healthchecks, carga básica e jornada crítica após recuperação.

## Transição segura para o gate de CI

A primeira publicação desta regra exige uma janela operacional única: pausar `xadrez-auto-deploy.timer`, enviar o commit para `main`, aguardar os três jobs e `Promote approved commit` ficarem verdes e então reativar o timer. Não execute o script de deploy por SSH. Após a transição, o agendador volta a operar sozinho e falha fechado para qualquer commit sem promoção.
