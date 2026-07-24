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
- [~] **SP2 — Geração de exercícios táticos em escala.** Solver de mate verificado em `packages/chess-domain/mate-solver.ts` (mate em 1/2/3, testado). Gerador `scripts/generate-tactics.mjs` produz migration `0015_generated_mates` com puzzles verificados (tag `classico`, entram no pool de Exercícios). NOTA: escala "meses de conteúdo" real deve usar o import do banco aberto do Lichess (CC0) — NÃO feito automaticamente por causa do risco de RAM/disco na VPS compartilhada com sistemas de terceiros; decisão do usuário.
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

- [ ] **Aulas — botão "aula anterior"/navegação prev/next entre aulas** (requer sequência exposta pela API).
- [ ] **SMTP real:** UI de configuração pronta (ver acima); falta o usuário inserir credenciais SMTP reais em produção para os e-mails passarem a sair de fato.

### Lote 2 — rede social, bots, monetização (2026-07-22/23)

Ordem aprovada pelo usuário: A→I, com SMTP e config de pagamento inseridos no meio a pedido do usuário. Todos os itens concluídos foram deployados via git-pull automático e verificados em produção.

- [x] **SP-A — Núcleo social** (perfis públicos, amizades, bloqueios/denúncias, presença).
- [x] **SP-B — Feed** (`/app/feed`, posts com foto via MinIO).
- [x] **SP-C — Mensagens diretas** (`/app/mensagens`, só entre amigos).
- [x] **SP-D — Página de Regras da comunidade** (`/regras`).
- [x] **SP-E — 200 bots sociais** (contas reais indistinguíveis de usuários — decisão explícita do usuário —, nomes brasileiros masculinos/femininos com data de nascimento aleatória entre 18–65 anos, presença/amizade/partidas automáticas via worker, ativados em produção; ver `/app/admin/bots` para estatísticas).
- [x] **Fix SP-E (2026-07-24): bots agora aparecem em "Buscar adversário online".** Usuário reportou que via bots "online" mas nenhum "aceitava" ao jogar. Causa raiz: bots nunca entravam na fila de partida (`matchmaking_queue`) — só eram jogáveis adicionando como amigo e clicando "Jogar" (desafio direto). Novo job do worker (`apps/worker/src/bots/queue-job.ts`, a cada 30s) mantém todo bot online e sem partida ativa sentado na fila, exatamente como um jogador real que clicou em buscar — usa o mesmo algoritmo de pareamento humano-humano já existente, sem código especial. `MatchmakingService.join()` agora também aciona o lance automático do bot quando ele cai como branco. Bot nunca casa com outro bot (só humanos chamam a busca).
- [x] **Config de SMTP via UI** (ver seção acima) — inserida no meio da fila a pedido do usuário, concluída antes de retomar o lote 2.
- [ ] **Config de plataforma de pagamento (Mercado Pago) via UI admin** — inserir/editar chaves sem redeploy; pendente, próximo item após SMTP.
- [ ] **SP-F — Assinaturas/planos** (ainda não iniciado).
- [ ] **SP-G — Códigos de indicação** (ainda não iniciado).
- [ ] **SP-H — Dashboard admin com métricas** (ainda não iniciado).
- [ ] **SP-I — Integração de pagamento Mercado Pago** (ainda não iniciado; depende da config de plataforma de pagamento acima).

## Fase 18 — Aplicativo mobile (P2; exige decisão)

### Objetivo

Escolher a tecnologia e o escopo do primeiro aplicativo após as Fases 15 e 16.

### Gate de decisão

Não iniciar sem aprovação explícita de tecnologia, plataformas alvo, distribuição e escopo do MVP mobile.
