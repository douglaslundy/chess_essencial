# App Android (e depois iOS)

Pedido de 2026-11-02: app Android idêntico ao site (cores, elementos, ícones), jogando com quem joga pelo navegador.

## Decisão

**TWA (Trusted Web Activity), gerada com Bubblewrap** (ferramenta oficial do Google).

- O app abre o próprio site em tela cheia, usando o Chrome do aparelho, sem barra de endereço.
- É idêntico por definição, porque é o mesmo site, o mesmo servidor e a mesma partida.
- Cada deploy pelo GitHub já atualiza o app; só se publica versão nova na loja quando muda ícone, nome ou domínio.

Descartados:

- **Reescrever em React Native ou Flutter:** não fica idêntico (tabuleiro 2D/3D, 91 KB de CSS, temas, balões), o Stockfish em WASM (`apps/web/public/engine/`) teria de virar nativo, o código seria mantido em dobro e levaria meses.
- **WebView comum (ou Capacitor no Android):** o WebView do Android não tem `speechSynthesis`, então a voz do navegador ficaria muda. A TWA usa o Chrome de verdade: voz do navegador, voz do GPT, áudio e Stockfish funcionam como no celular. Se o aparelho não tiver Chrome, a TWA abre no navegador padrão e a barra de endereço pode aparecer.

## Bloqueio: endereço público com HTTPS

Hoje a produção é `http://192.168.0.233:3100` (web) e `http://192.168.0.233:4100/v1` (API), só na rede local. A TWA exige:

1. HTTPS válido.
2. O arquivo `https://<host>/.well-known/assetlinks.json`, que liga o app ao site. Sem ele a barra de endereço aparece.
3. Acesso pela internet, porque no 4G o celular não chega ao IP local.

Caminhos (escolher um):

- **A. Subdomínio de `dlsistemas.com.br`.** Esse domínio já está na Cloudflare: `chess.dlsistemas.com.br` serve a página do livro "Xadrez Essencial | Douglas Lundy". Um subdomínio novo, por exemplo `jogar.dlsistemas.com.br`, com Cloudflare Tunnel (`cloudflared` na VPS) dá HTTPS sem abrir portas no roteador.
  - O usuário precisa criar o túnel no painel da Cloudflare e entregar o token. Nunca colocar senha ou token em campo do navegador nem no repositório.
- **B. Domínio próprio novo** (`xadrezessencial.com.br`, por exemplo), na Cloudflare, com o mesmo túnel.
- **C. Traefik com Let's Encrypt.** Já existe `deploy/docker-compose.traefik.yml` (rede externa `proxy`, `DOMAIN`, resolvedor `letsencrypt`). Exige as portas 80 e 443 do roteador apontando para a VPS.

Trocar de domínio depois é possível: o pacote do app continua o mesmo e uma atualização na loja muda o host. Os usuários precisam entrar de novo, porque a sessão é ligada ao domínio.

## Checklist quando houver domínio

### 1. Servidor (`.env.vps` na VPS, depois `deploy/remote-deploy.sh` e o auto-deploy)

- `PUBLIC_API_URL=https://<host>/v1`
  - Vira `NEXT_PUBLIC_API_URL` no build do web, então o web precisa ser reconstruído.
- `WEB_ORIGIN=https://<host>`
  - Serve para CORS, para o retorno do OAuth do ChatGPT (`chatgpt-oauth.controller.ts`) e para os links dos e-mails.
- `MINIO_PUBLIC_URL=https://<host>/avatars`
- Proxy na frente:
  - `/v1` vai para a API (porta 4000 do container; 4100 na VPS).
  - `/avatars` vai para o MinIO (9000).
  - O resto vai para o web (3000; 3100 na VPS).
  - O Traefik já tem essas regras. Com Cloudflare Tunnel, as mesmas regras de caminho entram no `config.yml` do `cloudflared`.
- Cookie de sessão:
  - Em HTTPS, `web-session-cookie.ts` passa a usar `__Host-xadrez_refresh` com `Secure`.
  - Testar login e reload de página, porque cookie `Secure` em HTTP é descartado.
- OAuth do ChatGPT: a URI de retorno muda para `https://<host>/v1/...`. Se houver app OAuth registrado na OpenAI, atualizar a URI lá também.
- Manter o acesso local `http://192.168.0.233:3100` funcionando, ou decidir desligá-lo.

### 2. Site instalável (PWA), sem mudar nada visível

- `apps/web/src/app/manifest.ts` (rota de manifesto do Next):
  - `name` "Xadrez Essencial" e `short_name`.
  - `start_url` `/app` e `display` `standalone`.
  - `background_color` e `theme_color` iguais ao fundo atual (`#0a0a0c`, conferir em `globals.css`).
  - Ícones 192, 512 e `maskable`, feitos a partir do logo atual.
- Servir `apps/web/public/.well-known/assetlinks.json` com o `package_name` e o SHA-256 da chave de assinatura (sai do passo 3). Se publicar pela Play Store, incluir também o SHA-256 da chave de assinatura do Google Play.
- Service worker: não é obrigatório para a TWA. Se for usar, só uma página "sem conexão", nunca cache das telas de partida.

### 3. Projeto Android (Bubblewrap)

- PC de build: Node (já existe), JDK 17 e Android SDK. O Bubblewrap baixa os dois sozinho, cerca de 2 GB; pedir autorização antes.
- Comandos:
  - `npx @bubblewrap/cli init --manifest https://<host>/manifest.webmanifest`
  - `npx @bubblewrap/cli build`
  - O resultado é `app-release-signed.apk` (instalação direta) e `app-release-bundle.aab` (Play Store).
- Pacote sugerido: `br.com.dlsistemas.xadrez`. Uma vez publicado, não muda mais.
- Versionar o projeto Android em `apps/android/` (`twa-manifest.json` e o gerado).
  - A keystore nunca vai para o Git. Quem guarda é o usuário: sem ela não dá para atualizar o app.
- Configurar:
  - Orientação "qualquer", para celular e tablet.
  - Cor da barra de status igual ao `theme_color`.
  - Splash com o ícone.

### 4. Testes (critério de aceite)

- Celular real no 4G, fora do Wi-Fi de casa.
  - Abre sem barra de endereço.
  - Login continua depois de fechar e reabrir o app.
- Partida app x navegador: lances, relógio, fim de partida e rating.
- Treinador falando com a voz do navegador e com a voz do GPT, e a velocidade da narração.
- Tabuleiro 3D, Stockfish (dicas e análise), curso, Biblioteca e revisão.
- Tablet: layout igual ao do navegador do tablet.
- Botão "voltar" do Android navega no site, e sai do app na tela inicial.

### 5. Distribuição

- Primeiro o APK direto no celular (o Android pede para permitir instalar de fonte desconhecida).
- Depois a Play Store:
  - Conta de desenvolvedor no nome do usuário (US$ 25, uma vez).
  - Teste interno, política de privacidade e classificação etária.
  - Conta pessoal nova exige um teste fechado com testadores por 14 dias antes de publicar.

### 6. iOS (depois do Android)

- O iPhone não tem TWA. Caminho: Capacitor com `server.url` apontando para `https://<host>`.
  - No iOS o WKWebView tem `speechSynthesis`, então a voz do navegador funciona.
- Build exige um Mac ou um serviço na nuvem (Codemagic, EAS ou Ionic Appflow), mais a conta Apple Developer (US$ 99 por ano).
- A Apple recusa app que é só um site embrulhado (regra 4.2). Pode precisar de algo nativo: notificação push, compartilhar partida ou háptico.

### Depois (opcional)

- Notificações "sua vez de jogar" por Web Push. Na TWA funcionam como notificação do app.
