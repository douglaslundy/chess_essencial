# Deploy por Git pull

O GitHub `douglaslundy/chess_essencial` é a única origem de código. O endereço do host de deploy é configurado fora do repositório, e o diretório `/home/lundy/xadrez-essencial` acompanha `origin/main`.

## Fluxo obrigatório

1. Concluir a fase e aprovar format, lint, typecheck, testes, build, imagens e gates de banco.
2. Executar as varreduras de charset, whitespace e segredos.
3. Integrar a mudança em `main` e fazer push para `origin`.
4. A CI executa `quality`, `container-validation` e `database-integration`; somente após os três aprovados ela avança `deploy/approved` para o mesmo commit.
5. O timer da VPS executa `deploy/auto-deploy.sh`, que exige igualdade exata entre `origin/main` e `origin/deploy/approved`.
6. O script usa `git pull --ff-only`, cria imagens com a tag do commit, faz backup, aplica migrations e valida healthchecks/carga.

Não se usa SCP, tar, `docker cp`, edição direta ou SSH para disparar deploy. SSH é reservado a diagnóstico e ao bootstrap inicial descrito em [RELEASE_RUNBOOK.md](./RELEASE_RUNBOOK.md).

## Bootstrap e agendamento

O primeiro acesso cria somente a infraestrutura operacional: deploy key somente leitura, clone do repositório e links das unidades em `deploy/systemd`. O timer de usuário `xadrez-auto-deploy.timer` consulta o GitHub a cada minuto. Sem `deploy/approved`, com CI pendente/vermelha ou com a referência em outro commit, o ciclo registra o bloqueio e não altera o checkout. O primeiro ciclo aprovado cria volumes e containers; ciclos seguintes atualizam exclusivamente pelo Git.

Diagnóstico permitido:

```bash
systemctl --user status xadrez-auto-deploy.timer
systemctl --user status xadrez-auto-deploy.service
tail -n 100 /home/lundy/xadrez-essencial/.deploy/auto-deploy.log
```

## Controles

- `flock` impede duas implantações simultâneas.
- Mudanças locais em arquivos rastreados bloqueiam o pull.
- O pull aceita somente avanço linear com `--ff-only`.
- `deploy/approved` avança sem force-push e somente no job final da CI de `main`; execuções antigas não conseguem regredir a referência.
- Ausência, erro de leitura ou divergência da referência de aprovação falha fechado antes do checkout/pull.
- O commit só é marcado como bem-sucedido após healthchecks e carga básica.
- Falhas são repetidas sem avançar o marcador de sucesso.
- `.env.vps`, backups e logs permanecem ignorados e restritos.
- O banco recebe backup com checksum antes de migrations quando já inicializado.
- Rollback de código é um novo commit aprovado em `main`, nunca uma edição na VPS.

## Ativação inicial do gate

Na primeira publicação que contiver este gate, pause o timer antes do push, aguarde a CI verde criar `deploy/approved` e só então reative o timer. Isso evita que a versão antiga do agendador consuma o próprio commit de transição antes da CI. Depois dessa ativação única, nenhuma intervenção manual faz parte do fluxo normal.
