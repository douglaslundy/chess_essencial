# Backlog V2

## Regra de execução

- Executar uma fase por vez, na ordem de prioridade.
- Antes de implementar, confirmar escopo, dependências e critérios de aceite.
- Não iniciar a fase seguinte enquanto testes e critérios da fase atual não estiverem aprovados.
- Mudanças de contrato exigem OpenAPI, cliente TypeScript e documentação atualizados.
- Deploy continua exclusivamente por `main` e `deploy/auto-deploy.sh` com `git pull --ff-only`.

## Fase 13 — Auditoria pós-release e saneamento documental (concluída)

### Objetivo

Comparar a release implantada com todo o blueprint, identificar defeitos e riscos reais e tornar a documentação a fonte de verdade atual.

### Entregáveis

- Matriz de conformidade atualizada para as Fases 1–12.
- Bugs classificados por severidade, com evidências e patches para achados P0/P1.
- Checklist de produção preenchido com evidências ou pendências explícitas.
- Verificação da jornada crítica, autorização, realtime, rating, curso, exercícios, segurança, backup e observabilidade.
- Registro dos comandos e resultados da auditoria.

### Critérios de aceite

- Nenhum achado P0 permanece aberto; todo P1 está corrigido ou atribuído a uma fase aprovada com gate explícito.
- `quality`, `database-integration` e `container-validation` aprovados.
- Healthchecks e commit implantado validados na VPS.
- Matriz, checklist e `PROGRESSO.md` refletem o estado real.

## Fase 14 - completed, tested and deployed (P0)

### Objetivo

Homologar os dez módulos e importar os 1.298 exercícios reais preservando IDs e referências.

### Critérios de aceite

- [x] Fonte de conteúdo inventariada e validada antes da importação.
- [x] Importação idempotente, transacional e auditável.
- [x] Contagens, IDs, referências e amostras conferidos no banco e na interface.
- [x] Backup anterior, rollback e reimportação aprovados.
- [x] Testes unitários, integração e E2E do fluxo de exercícios aprovados.

## Fase 15 — Contrato e SDK preparados para mobile (P1)

### Objetivo

Garantir que autenticação, REST e realtime possam ser consumidos por um aplicativo sem acesso ao banco ou dependência do frontend web.

### Critérios de aceite

- Cliente TypeScript reproduzível gerado do OpenAPI.
- Login, refresh, logout, recuperação de senha e WebSocket documentados para cliente não web.
- Testes de contrato cobrem autenticação e reconexão.
- Nenhuma regra de domínio depende do Next.js.

## Fase 16 — Acessibilidade, responsividade e UX crítica (P1)

### Objetivo

Homologar os fluxos de jogo, histórico, curso e exercícios em teclado, telas pequenas e tecnologias assistivas.

### Critérios de aceite

- Auditoria automatizada e manual das rotas críticas.
- Navegação por teclado, foco, contraste e anúncios de estado validados.
- Layouts críticos aprovados em viewport móvel e desktop.
- Regressões cobertas por testes pertinentes.

## Fase 17 — Eficiência e confiabilidade operacional (P1)

### Objetivo

Reduzir o tempo de release e completar retenção, restore e alertas operacionais.

### Critérios de aceite

- Build das três imagens reaproveita cache e evita trabalho triplicado desnecessário.
- Política de retenção de backups implementada e testada.
- Restore drill documentado e aprovado.
- Métricas e alertas essenciais possuem teste operacional.
- Relay SMTP de produção suporta TLS e autenticação; Mailpit permanece restrito a desenvolvimento/homologação.

### Pendência aberta em 2026-07-22 (pós-deploy chess.dlsistemas.com.br)

- [x] **Config de SMTP via UI (2026-07-23).** `/app/admin/smtp` (form host/porta/usuário/senha/remetente/TLS + botão de e-mail de teste), backend `GET/PUT /admin/settings/smtp` + `POST /admin/settings/smtp/test-email`, persistido em nova tabela `platform_settings` (chave-valor, migration `0021_platform_settings`) — troca sem redeploy. Aproveitado para reescrever `verification-email.service.ts`: o cliente SMTP anterior era um socket TCP cru que NUNCA enviava `AUTH LOGIN`/`AUTH PLAIN`, ou seja, mesmo com credenciais reais configuradas, a autenticação sempre falharia contra qualquer provedor real (Gmail, SendGrid etc.) — provavelmente a causa raiz de "e-mails não chegam" relatado antes. Substituído por `nodemailer` (com AUTH/STARTTLS reais) em `apps/api/src/settings/mailer.ts`, mantendo fallback para a env var `SMTP_URL` legada quando não há linha no banco (CI/dev/Mailpit). Falta remover o placeholder de `.env.vps` na VPS depois que o usuário configurar credenciais SMTP reais via essa página.

### Lote grande de melhorias (2026-07-22) — 8 sub-projetos

Ordem aprovada pelo usuário: 1→8, em modo automático, deploy incremental.

- [x] **SP1 — Avaliação automática + mate em N + progressão.** Endpoint `POST /v1/exercises/:id/evaluate-line` (server-authoritative), modal de vitória/derrota com som, progressão que exclui exercícios já resolvidos. `guided-challenge-lines.ts` removido. Deployado e validado no CI (database-integration). Spec/plano em `docs/superpowers/`.
- [x] **SP2 — Geração de exercícios táticos em escala.** Fase 1: solver de mate verificado em `packages/chess-domain/mate-solver.ts` (mate em 1/2/3, testado), gerador `scripts/generate-tactics.mjs`, migration `0015_generated_mates`. Fase 2 (2026-07-24, concluída com autorização explícita do usuário para o download): 8.003 puzzles do banco aberto do Lichess (CC0, `database.lichess.org`) importados via migration `0022_lichess_tactics` — processamento feito 100% local (download ~289 MB comprimido, filtro por popularidade/qualidade/rating, amostragem balanceada por 22 categorias táticas × 4 faixas de dificuldade via reservoir sampling, verificação de legalidade de TODOS os lances com chess.js), a VPS só aplica o SQL final já verificado (sem baixar nem processar nada pesado). Tags em português reaproveitando o vocabulário já usado nas migrations 0011-0013 (garfo, cravada, espeto, ataque_descoberto etc.) mais novas categorias (desvio, atração, raio_x, sacrifício, peça_pendurada, zugzwang etc.), categoria `mate` deliberadamente limitada a ~10% do lote por já ser bem coberta pela geração procedural. Todos entram tagueados `classico` no pool de Exercícios.
- [x] **SP4 — Ver rating.** Rating agora aparece no pill do canto superior direito + dropdown com todos os pools. Deployado junto com SP5/SP7.
- [x] **SP5 — Meus dados no canto superior direito.** Nome do usuário vira menu dropdown (rating + "Meus dados" + "Sair"); item removido da sidebar. (Upload de avatar: PENDENTE, ver abaixo.)
- [x] **SP7 — Contraste do tabuleiro/peças.** Preenchimentos mais puros, contornos de tom oposto mais fortes e halos por cor; casas com tons levemente separados.

Concluídos depois (todos deployados):

- [x] **SP3 — Conteúdo de estudo antes das perguntas do livro.** `GET /v1/exercises/:id/study` retorna o texto real da aula vinculada + páginas; painel de estudo no `ExerciseTrainer`.
- [x] **SP6 — Modo sem tempo** (time control `untimed`, relógio ∞, não ranqueado) + tabuleiro demonstrativo com voltar/avançar e ramificação.
- [x] **SP5b — Upload de avatar** via bucket MinIO (serviço isolado no stack, bucket público `avatars` servido pelo Traefik em `/avatars`, `POST /v1/me/avatar` com imagem redimensionada no cliente ≤512KB). Exibido em Meus Dados e no canto superior direito.
- [x] **SP8 — Área de administrador** com gestão de usuários (suspender/reativar/soft-delete, guardada por role admin).
- [x] **Curso alinhado ao livro completo** (`livrocompleto/Xadrez_Essencial_Edicao_Completa_Douglas_Lundy.pdf`): 119 aulas enriquecidas com o texto real de cada capítulo (script `scripts/enrich-lessons-from-book.mjs`, 714→863 steps).
- [x] **Deploy 100% via git-pull automático**: timer systemd `xadrez-auto-deploy.timer` na VPS deploya `origin/main` a cada minuto (build + migrate/seed/import + up com overlay Traefik). Push = deploy. Não usar SSH manual para deploy.

Pendências restantes:

- [x] **Aulas — botão "aula anterior"/navegação prev/next entre aulas (2026-07-24).** API (`GET /v1/lessons/:id`) agora expõe `previousLessonId` além do já existente `nextLessonId`, calculado na mesma CTE ordenada por `course_modules.position, lessons.position` (`lesson-runtime.repository.ts`). Frontend (`lesson-player.tsx`) ganhou uma barra de navegação "← Aula anterior / Próxima aula →" visível durante toda a aula (antes só existia o link de próxima aula na tela de conclusão, que continua lá também).
- [ ] **SMTP real:** UI de configuração pronta (ver acima); falta o usuário inserir credenciais SMTP reais em produção para os e-mails passarem a sair de fato.

### Lote 2 — rede social, bots, monetização (2026-07-22/23)

Ordem aprovada pelo usuário: A→I, com SMTP e config de pagamento inseridos no meio a pedido do usuário. Todos os itens concluídos foram deployados via git-pull automático e verificados em produção.

- [x] **SP-A — Núcleo social** (perfis públicos, amizades, bloqueios/denúncias, presença).
- [x] **SP-B — Feed** (`/app/feed`, posts com foto via MinIO).
- [x] **SP-C — Mensagens diretas** (`/app/mensagens`, só entre amigos).
- [x] **SP-D — Página de Regras da comunidade** (`/regras`).
- [x] **Fix (2026-07-24): nome e avatar do adversário não apareciam na partida ao vivo.** Causa raiz: `GameState.players` (contrato + `games.repository.ts`) nunca trazia `username`/`displayName`/`avatarUrl`, só `userId`/`color`/`ratingBefore` — o componente `Player` do tabuleiro nem recebia esse dado, só mostrava rótulos fixos "Jogador branco"/"Jogador preto" com uma letra genérica no lugar do avatar. Corrigido na fonte única (`getStateInTransaction`, usada por HTTP e pelo snapshot realtime via WebSocket): agora faz JOIN com `users`/`user_profiles` e devolve nome/avatar reais; frontend (`game-room.tsx`) exibe o avatar (ou iniciais do nome, se sem avatar) e o nome de exibição de cada jogador.
- [x] **SP-E — 200 bots sociais** (contas reais indistinguíveis de usuários — decisão explícita do usuário —, nomes brasileiros masculinos/femininos com data de nascimento aleatória entre 18–65 anos, presença/amizade/partidas automáticas via worker, ativados em produção; ver `/app/admin/bots` para estatísticas).
- [x] **Fix SP-E (2026-07-24): bots agora aparecem em "Buscar adversário online".** Usuário reportou que via bots "online" mas nenhum "aceitava" ao jogar. Causa raiz: bots nunca entravam na fila de partida (`matchmaking_queue`) — só eram jogáveis adicionando como amigo e clicando "Jogar" (desafio direto). Novo job do worker (`apps/worker/src/bots/queue-job.ts`, a cada 30s) mantém todo bot online e sem partida ativa sentado na fila, exatamente como um jogador real que clicou em buscar — usa o mesmo algoritmo de pareamento humano-humano já existente, sem código especial. `MatchmakingService.join()` agora também aciona o lance automático do bot quando ele cai como branco. Bot nunca casa com outro bot (só humanos chamam a busca).
- [x] **Config de SMTP via UI** (ver seção acima) — inserida no meio da fila a pedido do usuário, concluída antes de retomar o lote 2.
- [x] **Fix (2026-07-24): mensagens de erro em inglês em desafios/partidas + página "Jogar" com seleção por dropdown.** Usuário relatou ver "A pending challenge already exists" em inglês. Traduzidas todas as mensagens de exceção remanescentes em `matchmaking.repository.ts` e `games.repository.ts` (mesmo padrão de vazamento já corrigido antes em `exercises.repository.ts`). A pedido do usuário, `/app/jogar` trocou os cartões clicáveis de controle de tempo e os rádios de adversário (bot × online) por `<select>`, com **"Sem tempo" como padrão** agora (antes era "10+0").
- [x] **Fix (2026-07-24): desafio direto entre amigos reais não chegava pro destinatário.** Relatado pelo usuário; investigado e corrigido por um agente em worktree isolado (rodado em paralelo ao SP-F). Causa raiz: o backend de desafio direto (`direct_challenges`) funcionava certo — criava o desafio e rejeitava duplicado — mas não existia NENHUM jeito do desafiado ver que tinha um desafio pendente (sem endpoint `GET`, sem UI). O desafio "sumia" pro destinatário e uma segunda tentativa em qualquer direção batia no 409 de "já existe", travando os dois. Corrigido com `GET /matchmaking/challenges` (`incoming`/`outgoing`) + seção "Desafios recebidos/enviados" na página de Amigos (aceitar/recusar, poll a cada 5s), com teste e2e novo cobrindo os dois lados. Mesclado no branch principal (merge commit `2b71191`).
- [x] **Fix (2026-07-24): "já existe um desafio pendente" fantasma, sem jeito de achar ou cancelar.** Usuário relatou continuar preso mesmo depois do fix acima: o sistema recusava um novo desafio dizendo que já havia um pendente, mas nenhum dos dois lados via esse desafio em lugar nenhum, nem tinha como cancelá-lo. **Causa raiz real**: nada nunca "expira" ativamente uma linha de `direct_challenges` — ela só vira `expired` quando o DESTINATÁRIO clica em aceitar/recusar depois do prazo (10 min). Como o `listChallenges()` corretamente ESCONDE desafios com `expires_at` vencido, o destinatário nunca via o desafio pra poder recusá-lo — então a linha ficava com `status='pending'` PRA SEMPRE, bloqueando novos desafios entre o par pra sempre (tanto pela checagem de duplicidade no código, que não filtrava `expires_at`, quanto pelo índice único parcial do banco `uq_direct_challenges_pending_pair`, que só permite uma linha `pending` por par). Corrigido: `createChallenge()` agora expira ativamente qualquer desafio `pending` vencido entre o par ANTES de checar duplicidade/inserir. Também adicionado o que faltava: (1) `DELETE /matchmaking/challenges/:challengeId` — o próprio desafiante agora pode cancelar um desafio que enviou (botão "Cancelar" nos "Desafios enviados"); (2) o desafiante agora É AVISADO quando o desafio é aceito — `listChallenges()` passou a incluir, por até 1 minuto, o desafio recém-aceito com o `gameId` resultante, e o poll de 5s da página de Amigos detecta isso e entra automaticamente na partida (endereça o pedido do usuário de "poder entrar no tabuleiro e aguardar o desafiado lá", sem precisar de um canal realtime novo). Testes e2e novos cobrem: desbloqueio após expiração, cancelamento pelo desafiante (e proibição pro destinatário cancelar), e o `gameId` aparecendo no lado do desafiante após aceite.
- [x] **Fix (2026-07-24): lote de bugs de exercícios/aulas.** Aula demo do seed.ts corrompendo o capítulo 1 real (colisão de vaga módulo1/posição1 + cache de diff do importador não detectava a sobrescrita externa; migration `0024`), exercícios do livro (todos `free_text`) exigindo bater o gabarito exato sem dica cadastrada — agora com autoavaliação (usuário revela a resposta do livro e marca se acertou), mensagens de erro do backend de exercícios em inglês traduzidas, painel de estudo não herda mais passos `board_instruction` sem tabuleiro, progressão de exercícios não reseta mais ao trocar de aba de origem, rótulo `board_instruction` cru traduzido na aula. Ver `PROGRESSO.md`.
- [x] **Separar/filtrar exercícios "Clássicos" por origem (mates procedurais × 8.003 puzzles do Lichess) — 2026-07-24.** Usuário optou por estender o filtro de abas existente em vez de criar página nova. Nova 4ª aba "Banco Lichess" em `/app/exercicios` ao lado de "Todos/Mates clássicos/Livro"; backend (`source` no contrato `ExerciseSearchQuery`/`ExerciseTrainingFilters`, `api/openapi.yaml`) ganhou o valor `lichess` (`'lichess' = ANY(e.tags)`), e "Mates clássicos" agora exclui explicitamente quem tem a tag `lichess` (antes os dois lotes ficavam misturados sob `classico`). Reaproveita a correção de progressão por aba feita mais cedo na sessão.
- [x] **Fix crítico (2026-07-24): cadastro público retornava 503 sempre que o e-mail de verificação falhava.** Descoberto ao criar uma conta a pedido do usuário: `register()` criava a linha do usuário e SÓ DEPOIS tentava enviar o e-mail de verificação — como o SMTP real de produção ainda não está configurado, `VerificationEmailService.send()` lança `ServiceUnavailableException` em produção, e como não havia `try/catch`, a requisição inteira falhava com 503 mesmo com a conta já criada no banco (ou seja, TODO cadastro novo no site estava falhando visivelmente enquanto parecia não ter feito nada). Corrigido: `register()` agora captura a falha de envio, retorna sucesso (201) com um novo campo `emailSent: boolean`, e a tela de cadastro mostra uma mensagem clara quando o e-mail não pôde ser enviado, em vez de um erro cru. Contrato (`RegistrationResponse`), `api/openapi.yaml`, `auth.service.ts` e `entrar/page.tsx` atualizados; teste novo em `auth.service.test.ts` cobre o caminho de falha de e-mail.
- [x] **Incidente operacional (2026-07-24): conta `pedrolucasfacil@gmail.com` presa em "pendente" por causa do bug acima.** Usuário pediu pra eu criar essa conta; ela ficou travada (pendente, sem e-mail entregue) até o fix acima. Ativada manualmente em produção via `docker compose exec postgres psql` na VPS (mesmo UPDATE que `activateUser()` faria: `status='active'`, `email_verified_at=now()`), a pedido explícito do usuário ("faça diretamente no banco"). A conta real ficou com usuário `Pedro` (o próprio usuário se cadastrou pelo site enquanto eu diagnosticava, com um nome de usuário diferente do que tinha me passado). Uma conta de teste criada por engano durante o diagnóstico (`pedrolucas_x` / `pedrolucasfacil-status-check@gmail.com`) foi soft-deletada (`status='deleted'`) pelo mesmo caminho.
- [x] **Config de plataforma de pagamento (Mercado Pago) via UI admin (2026-07-24).** Mesmo padrão do SMTP: `/app/admin/mercado-pago` (ambiente sandbox/produção, public key, access token mascarado — só mostra se está configurado, nunca o valor — e botão "Testar conexão" que confirma as credenciais direto na API do Mercado Pago via `GET /users/me`), backend `GET/PUT /admin/settings/mercado-pago` + `POST /admin/settings/mercado-pago/test-connection`, reaproveitando a tabela genérica `platform_settings` (chave `payment.mercado_pago`, sem migration nova). Cobre só a config de chaves — o checkout/integração de pagamento em si é a SP-I, ainda não iniciada.
- [x] **SP-F — Assinaturas/planos (2026-07-24).** Usuário aprovou modo autônomo pra decidir o escopo. Catálogo de recursos extensível em código (`packages/contracts/src/subscriptions.ts`, `planFeatureCatalog`: hoje `exercises_per_day`, `games_per_day`, `lessons_per_day` — adicionar recurso novo não exige migration). Migration `0025_subscription_plans` (`subscription_plans`, `subscription_plan_limits` — feature ausente = não incluso no plano, `daily_limit=0` = ilimitado —, `user_subscriptions`, no máximo uma assinatura ativa por usuário). Módulo `apps/api/src/subscriptions/`: CRUD admin (`/admin/subscription-plans`, página `/app/admin/planos`), `GET /me/subscription`, e `SubscriptionsService.checkEntitlement()` reaproveitando contagens das tabelas já existentes (sem tabela de contador nova) — **decisão de segurança**: usuário sem assinatura ativa é sempre ilimitado, então ninguém é afetado até realmente assinar um plano pago (o que só existirá de fato com a SP-I). Checagem ligada em `exercises.repository.ts#attempt()`, `lesson-runtime.repository.ts#start()` e `matchmaking.repository.ts#join()` (fila). **Fast-follow concluído (2026-07-24, após o merge do fix de desafios):** checagem de `games_per_day` ligada em `games.repository.ts#create()`, `#createBotGame()` e em `matchmaking.repository.ts#respondChallenge()` (aceitar desafio) — cobre agora os quatro pontos de criação de partida (fila, desafio direto, bot, aceitar desafio).
- [x] **SP-G — Códigos de indicação (2026-07-24).** Cada usuário tem um código único (gerado sob demanda, `user_profiles.referral_code`, migration `0026`), visível em Meus Dados com link pronto pra compartilhar (`?ref=CODIGO` na tela de cadastro). `registerInputSchema` ganhou `referralCode` opcional; atribuição (`referrals`, um por usuário indicado) acontece no cadastro, e a recompensa só é aplicada quando o indicado **confirma o e-mail** (evita pagar por conta nunca verificada). Recompensa é **opcional e configurável pelo admin** (`/app/admin/indicacoes`: escolhe um plano existente do SP-F + quantos dias) — reaproveita `SubscriptionsService.grantTemporaryPlanIfNone`, que só concede a assinatura temporária se o indicador ainda não tiver uma ativa (nunca derruba um plano pago existente). Sem plano configurado, a indicação continua sendo contabilizada, só não concede nada. Módulo `apps/api/src/referrals/` é global (mesmo padrão do settings/subscriptions) para o `AuthService` poder chamar sem import circular — os controllers ficam registrados em `AuthModule`/`AdminModule`, não no próprio módulo, pra evitar exatamente esse ciclo.
- [x] **SP-H — Dashboard admin com métricas (2026-07-24).** `GET /admin/metrics` (`AdminService`/`AdminRepository`, mesmo controller de `/admin/users` e `/admin/bots/stats`) agrega: usuários ativos, novos cadastros (7 dias), partidas (total/hoje), exercícios resolvidos, aulas concluídas, assinaturas ativas por plano (SP-F) e indicações registradas/recompensadas (SP-G). Página `/app/admin/metricas`, mesmo estilo de cartões da página de bots.
- [x] **SP-I — Checkout de assinatura via Mercado Pago (2026-07-24).** Fluxo completo: `GET /subscription-plans` (catálogo público, só planos ativos) → página `/app/planos` → `POST /me/subscription/checkout` cria uma assinatura `pending` local (id vira o `external_reference` do Mercado Pago) e chama a API de Preapproval (assinaturas recorrentes) do Mercado Pago, devolvendo o `init_point` pra redirecionar o usuário → `POST /webhooks/mercado-pago` (rota pública, sem guard de sessão — é o Mercado Pago chamando) recebe a notificação, **verifica a assinatura HMAC-SHA256** (`x-signature`/`x-request-id`, formato documentado pelo Mercado Pago) contra um `webhookSecret` novo nas configurações admin (`/app/admin/mercado-pago`) — sem o secret configurado, o webhook recusa tudo (nunca aceita confirmação de pagamento sem verificar assinatura) — e então busca o preapproval completo na API deles e ativa/cancela a assinatura local. Migration `0027` adiciona o status `pending` à tabela `user_subscriptions` (fica fora do índice único de "uma ativa por usuário", que só cobre `status='active'`). Testes novos cobrem a verificação de assinatura (aceita válida, rejeita secret errado, rejeita payload adulterado, rejeita sem header, rejeita sem secret configurado).
  - **Importante, sem verificação ponta a ponta**: não há como testar contra o Mercado Pago de verdade nesta sessão (sem credenciais sandbox configuradas nem acesso de rede pra simular o webhook deles). A lógica foi implementada com o máximo de fidelidade possível ao formato documentado da API de Preapproval e do esquema de assinatura de webhook, mas **precisa ser validada pelo usuário** com uma conta sandbox real (criar credenciais de teste no painel do Mercado Pago, configurar em `/app/admin/mercado-pago` incluindo o webhook secret, apontar a URL de notificação pra `https://chess.dlsistemas.com.br/v1/webhooks/mercado-pago`, e fazer uma assinatura de teste de ponta a ponta) antes de confiar nisso em produção com dinheiro real.

## Fase 18 — Aplicativo mobile (P2; exige decisão)

### Objetivo

Escolher a tecnologia e o escopo do primeiro aplicativo após as Fases 15 e 16.

### Gate de decisão

Não iniciar sem aprovação explícita de tecnologia, plataformas alvo, distribuição e escopo do MVP mobile.

## Fase 19 — Motor de xadrez real (pré-requisito compartilhado das Fases 20 e 21)

### Objetivo

Dar à plataforma uma fonte de avaliação de posição/lance forte o suficiente para classificar a qualidade de um lance (excelente/bom/imprecisão/erro/gafe/oportunidade perdida) e sugerir o melhor lance com justificativa — coisa que hoje NÃO existe no código.

### Por que esta fase existe (achado da pesquisa de 2026-07-24)

O único "avaliador" hoje é `packages/chess-domain/src/bot-move.ts` (`evaluate()`/`scoreMove()`/`selectBotMove()`): material + bônus de casas centrais + mobilidade, com no máximo 1 lance de profundidade de busca (usado só para o bot escolher uma jogada plausível por faixa de rating). Isso é suficiente para um adversário bot, mas raso demais para classificar lances ou explicar "por quê" um lance é bom — precisa de um motor de verdade (nível Stockfish), que não existe no projeto hoje (nenhum binário/WASM/cliente UCI em nenhum `package.json`, `compose.yml` ou `Dockerfile*`).

Pontos a favor de fazer esta fase primeiro e separada: as Fases 20 (revisão de partida) e 21 (treinador) dependem exatamente da mesma capacidade (avaliar uma posição em centipawns e obter o melhor lance); construir isso uma vez, testado e isolado, evita duplicar integração de motor em dois lugares.

### Gate de decisão — RESOLVIDO em 2026-07-24

Decisão do usuário: **arquitetura híbrida**. Stockfish WASM no navegador para o aviso "rápido" do treinador durante a partida (precisa parecer instantâneo) + motor no servidor, em fila assíncrona no worker, para a revisão completa pós-partida (pode demorar alguns segundos sem problema). Sem custo fixo extra de servidor para a parte em tempo real; a parte assíncrona roda no worker existente.

### Entregáveis

- [x] Escolha de arquitetura registrada aqui (decisão do usuário, 2026-07-24: híbrida).
- [x] Integração do motor no lado servidor: `apps/worker/vendor/stockfish/` vendoriza o Stockfish 18 Lite (WASM single-thread, ~7MB, NNUE `nn-9067e33176e8.nnue`, GPL-3.0, baixado das releases de `nmrugg/stockfish.js`), rodado como subprocesso via `apps/worker/src/engine/stockfish-engine.ts` (`evaluatePosition(fen, {depth})` fala UCI puro por stdin/stdout — o `.js` foi renomeado para `.cjs` porque o worker é `"type":"module"` e o bundle usa `require`). Testado de ponta a ponta (posição inicial + mate em 1) em `stockfish-engine.test.ts`. **Pendente**: instância WASM no cliente (`apps/web`) — adiada para quando a Fase 21 ("Sugerir lance") de fato precisar dela, para não construir infraestrutura sem consumidor.
- [x] Limiares de classificação de lance definidos e implementados em `packages/chess-domain/src/move-quality.ts` (`classifyMove`): perda de centipawns ≤10 ótimo, ≤20 excelente, ≤50 bom, ≤100 imprecisão, ≤300 erro, >300 gafe (mate tratado como ±100000cp). "Oportunidade perdida" = perda ≥150cp com a posição resultante ainda não perdida (≥-50cp) — flag independente da categoria de qualidade, inclusive combinável com "gafe" (ex.: abriu mão de mate forçado mas seguiu claramente melhor). Testado em `move-quality.test.ts`.
- [x] Serviço/utilitário reaproveitável: classificação pura em `@xadrez/chess-domain` (consumível tanto pelo job assíncrono do worker quanto por uma futura checagem em tempo real no cliente); avaliação de posição hoje só no lado servidor (`apps/worker`) — ver nota acima sobre o lado cliente.

## Fase 20 — Revisão de partida pós-jogo (P1; depende da Fase 19)

### Objetivo

Ao final de cada partida, oferecer uma análise da partida inteira: resumo em duas colunas (eu × adversário) com contagem de lances por categoria (excelente, bom, imprecisão, erro, gafe, oportunidade perdida), e depois uma revisão lance a lance navegável.

### Entregáveis

- [ ] Job assíncrono no worker (`apps/worker`, seguindo o padrão já existente de `presence-job.ts`/`queue-job.ts` ou a fila BullMQ já conectada) que roda a análise completa de uma partida terminada a partir de `game_moves` (já persistido por lance) e grava o resultado por lance + o resumo agregado.
- [ ] Novo endpoint(s) para buscar o resumo da análise de uma partida e os dados lance a lance.
- [ ] Tela de resumo pós-partida com as duas colunas (eu × adversário) e as contagens por categoria.
- [ ] Botão "Iniciar revisão" → navegação lance a lance no tabuleiro (reaproveitando o padrão de histórico/replay já usado no treinador de exercícios) com um balãozinho de texto por lance, resumindo a avaliação daquele lance.
- [ ] Narração por voz (Web Speech API `SpeechSynthesisUtterance` no cliente — hoje inexistente no projeto) lendo a avaliação de cada lance durante a revisão, com opção de ligar/desligar.

## Fase 21 — Jogar com o treinador (P1; depende da Fase 19)

### Objetivo

Um modo de partida contra bot onde a dificuldade do bot sempre acompanha o rating atual do jogador (nunca fixa), que pausa brevemente a partida para avisar quando o jogador faz um lance perigoso/gafe (com opção de desfazer e jogar de novo), e que tem uma opção de configuração "Sugerir lance" que, quando ativa, sugere o melhor lance e explica o porquê antes de cada jogada do usuário.

### Entregáveis

- [ ] Novo modo de partida "Treinador", reaproveitando a infraestrutura de bot já existente (`game_bots.target_rating`, `selectBotMove`) mas com `target_rating` sempre igual ao rating atual do jogador no pool da partida (não uma faixa fixa escolhida manualmente como hoje).
- [ ] Checagem em tempo real (usando o motor da Fase 19) do lance que o jogador acabou de fazer; se classificado como gafe/erro grave, pausar a partida com um aviso e oferecer desfazer o lance.
- [ ] Configuração por usuário "Sugerir lance" (em Meus dados/Configurações) — quando ativa, antes de cada lance do jogador (nas partidas de Treinador) mostra o melhor lance sugerido pelo motor com uma breve explicação do motivo.
- [ ] Partidas de Treinador não devem contar para o rating oficial (mesmo espírito do modo sem tempo/demonstrativo já existente) — confirmar com o usuário se este é o comportamento esperado antes de implementar.
