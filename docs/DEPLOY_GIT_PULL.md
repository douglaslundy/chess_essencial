# Deploy por Git pull

O GitHub é a única origem de código para a VPS. O diretório `/home/lundy/xadrez-essencial` acompanha `origin/main` e um agendador local executa `deploy/auto-deploy.sh` a cada minuto.

## Fluxo obrigatório

1. Concluir a fase e aprovar format, lint, typecheck, testes e build.
2. Executar as varreduras de charset, whitespace e secrets.
3. Criar commit na `main` e fazer push para `origin`.
4. O agendador da VPS executa `git fetch` e `git pull --ff-only`.
5. O script constrói a imagem, aplica migrations, executa seed e aguarda os healthchecks.

Não se usa `scp`, arquivo tar, cópia direta de código ou deploy disparado por sessão SSH. O SSH fica reservado para diagnóstico e para o bootstrap inicial do agendador.

## Configuração da VPS

O repositório é privado. A VPS usa a chave `~/.ssh/xadrez_github_deploy`, registrada no GitHub como deploy key somente leitura, por meio do alias `github-xadrez`. O remoto do projeto é `github-xadrez:douglaslundy/chess_essencial.git`.

O agendador é o timer de usuário `xadrez-auto-deploy.timer`:

- serviço: `~/.config/systemd/user/xadrez-auto-deploy.service`;
- timer: `~/.config/systemd/user/xadrez-auto-deploy.timer`;
- intervalo: 60 segundos;
- persistência após logout/reinício: `loginctl enable-linger lundy`.

Diagnóstico permitido:

```bash
systemctl --user status xadrez-auto-deploy.timer
systemctl --user status xadrez-auto-deploy.service
tail -n 100 /home/lundy/xadrez-essencial/.deploy/auto-deploy.log
```

## Segurança operacional

- `flock` impede duas implantações simultâneas.
- Alterações locais em arquivos rastreados bloqueiam o pull.
- O pull aceita somente avanço linear com `--ff-only`.
- O commit só é marcado como bem-sucedido após os healthchecks.
- Falhas são tentadas novamente no próximo ciclo porque o marcador não avança.
- `.env.vps` permanece ignorado pelo Git e com permissões restritas.
- O log local fica em `.deploy/auto-deploy.log`, também ignorado.
