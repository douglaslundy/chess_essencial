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

- O deploy em produção (VPS 144.91.92.70, atrás do Traefik) subiu com `SMTP_URL` **placeholder** (`smtp://user:password@smtp.placeholder.invalid:587`) em `/opt/chess/.env.vps` — e-mails de verificação de cadastro NÃO são enviados de verdade até isso ser resolvido.
- Tarefa: criar uma página de configuração de SMTP via UX (host, porta, usuário, senha, remetente, TLS) na área `/app/admin` (já existe `/app/admin/curso`; role `admin` já existe em `schema.ts`), acessível a partir do fluxo de criação de usuário administrador. Persistir a configuração (não depender só de variável de ambiente estática) para permitir troca sem redeploy.
- Depois que essa página existir e estiver validada em produção, remover o placeholder do `.env.vps` da VPS e migrar para a configuração via UI.

### Lote grande de melhorias (2026-07-22) — 8 sub-projetos

Ordem aprovada pelo usuário: 1→8, em modo automático, deploy incremental.

- [x] **SP1 — Avaliação automática + mate em N + progressão.** Endpoint `POST /v1/exercises/:id/evaluate-line` (server-authoritative), modal de vitória/derrota com som, progressão que exclui exercícios já resolvidos. `guided-challenge-lines.ts` removido. Deployado e validado no CI (database-integration). Spec/plano em `docs/superpowers/`.
- [~] **SP2 — Geração de exercícios táticos em escala.** Solver de mate verificado em `packages/chess-domain/mate-solver.ts` (mate em 1/2/3, testado). Gerador `scripts/generate-tactics.mjs` produz migration `0015_generated_mates` com puzzles verificados (tag `classico`, entram no pool de Exercícios). NOTA: escala "meses de conteúdo" real deve usar o import do banco aberto do Lichess (CC0) — NÃO feito automaticamente por causa do risco de RAM/disco na VPS compartilhada com sistemas de terceiros; decisão do usuário.
- [x] **SP4 — Ver rating.** Rating agora aparece no pill do canto superior direito + dropdown com todos os pools. Deployado junto com SP5/SP7.
- [x] **SP5 — Meus dados no canto superior direito.** Nome do usuário vira menu dropdown (rating + "Meus dados" + "Sair"); item removido da sidebar. (Upload de avatar: PENDENTE, ver abaixo.)
- [x] **SP7 — Contraste do tabuleiro/peças.** Preenchimentos mais puros, contornos de tom oposto mais fortes e halos por cor; casas com tons levemente separados.

Sub-projetos ainda PENDENTES (precisam de spec própria; não implementados nesta sessão para não fazer malfeito):

- [ ] **SP3 — Exercícios do livro com conteúdo de estudo antes da pergunta.** As 1.298 perguntas do livro são `free_text` de reflexão. O conteúdo de estudo JÁ existe nas 119 aulas (714 steps, 1282 links aula↔exercício). Solução proposta: exibir o conteúdo da aula vinculada (ou um resumo/páginas de origem `sourcePages`) antes da pergunta. Requer wiring aula↔exercício no fluxo de Exercícios.
- [ ] **SP6 — Modo de partida sem tempo** (partidas livres) + tabuleiro demonstrativo com voltar/avançar lance e ramificação (jogar lance diferente ao voltar). Backend (time control opcional/sem relógio) + frontend.
- [ ] **SP5b — Upload de avatar** em Meus Dados, exibido no canto superior direito e onde precisar. Requer definição de storage (a VPS não tem bucket; avaliar coluna base64 pequena vs. volume de arquivos vs. storage externo).
- [ ] **SP8 — Área de administrador.** Já existe `/app/admin/curso` e role `admin`. Ampliar para: gerenciar bots, bloquear/excluir/banir usuários, regras da plataforma, config de SMTP (ver pendência acima). Auditar o que já é configurável antes de implementar.
- [ ] **Aulas — botão "aula anterior"/navegação entre aulas.** A unificação tabuleiro+pergunta já foi feita (layout `lessonRuntimeGridStacked`). Falta navegação prev/next entre aulas do curso (requer sequência de aulas exposta pela API).

## Fase 18 — Aplicativo mobile (P2; exige decisão)

### Objetivo

Escolher a tecnologia e o escopo do primeiro aplicativo após as Fases 15 e 16.

### Gate de decisão

Não iniciar sem aprovação explícita de tecnologia, plataformas alvo, distribuição e escopo do MVP mobile.
