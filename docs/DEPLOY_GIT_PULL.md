# Deploy por Git pull

O GitHub é a única origem de código para a VPS. O diretório `/home/lundy/xadrez-essencial` acompanha `origin/main` e um agendador local executa `deploy/auto-deploy.sh` a cada minuto.

## Fluxo obrigatório

1. Concluir a fase e aprovar format, lint, typecheck, testes e build.
2. Executar as varreduras de charset, whitespace e secrets.
3. Criar commit na `main` e fazer push para `origin`.
4. O agendador da VPS executa `git fetch` e `git pull --ff-only`.
5. O script constrói a imagem, aplica migrations, executa seed e aguarda os healthchecks.

Não se usa `scp`, arquivo tar, cópia direta de código ou deploy disparado por sessão SSH. O SSH fica reservado para diagnóstico e para o bootstrap inicial do agendador.

## Segurança operacional

- `flock` impede duas implantações simultâneas.
- Alterações locais em arquivos rastreados bloqueiam o pull.
- O commit só é marcado como bem-sucedido após os healthchecks.
- Falhas são tentadas novamente no próximo ciclo porque o marcador não avança.
- `.env.vps` permanece ignorado pelo Git e com permissões restritas.
- O log local fica em `.deploy/auto-deploy.log`, também ignorado.
