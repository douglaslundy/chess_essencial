# Auditoria de arquitetura — Tarefa 20

## Estado e escopo

- Tarefa: `T20-A02 — Arquitetura, stack e módulos`.
- Base: `main@0203a67e3762e1756438b498d2f9e8e81864022c`.
- Data: 2026-07-30.
- Método: manifests, código ativo, migrations, contratos, testes, Compose, CI e deploy.
- Limite: auditoria documental; nenhum código de produto foi alterado.

Documentos históricos foram usados apenas como orientação. Em divergências, código e gates executáveis prevalecem.

## Resumo executivo

A plataforma é um monorepo TypeScript API-first, separado em web, mobile, API, worker e pacotes de domínio. PostgreSQL é a fonte autoritativa; Redis sustenta realtime e filas; MinIO recebe uploads; Stockfish roda no worker; LLMs apenas narram fatos calculados. A base preserva regras críticas: servidor autoritativo, jogadas idempotentes, rating separado, API `/v1`, migrations versionadas e clientes sem acesso direto ao banco.

Não é um protótipo vazio: há 40 pares de migrations, 94 paths/110 operações no OpenAPI, 92 arquivos de teste e 23 arquivos e2e. Web e API cobrem jogo, revisão, cursos, exercícios, Jornada, social, assinaturas, administração e IA; mobile cobre um subconjunto funcional.

Principais riscos confirmados:

1. OpenAPI não contém as rotas ativas da Jornada nem `POST /games/:gameId/live-narration`;
2. auto-deploy acompanha `origin/main` sem consultar a CI;
3. rate limit HTTP fica na memória de cada processo;
4. access e refresh tokens do web ficam em `localStorage`;
5. jobs usam `setInterval`/polling e escalar workers exige exclusão mútua comprovada;
6. mobile não possui build assinado no pipeline atual.

Nenhum achado autoriza troca de framework, banco, engine ou autenticação.

## Visão arquitetural

```text
Web Next.js ───┐
               ├─ HTTP /v1 ───────┐
Mobile Expo ───┴─ WS /v1/ws ───┐  │
                               ▼  ▼
                         NestJS/Fastify API
                         │ regras/autorização
                    ┌────┼──────────┐
                    ▼    ▼          ▼
               PostgreSQL Redis    MinIO
                    ▲    ▲
                    └─ Worker
                       ├ Stockfish
                       ├ narração LLM
                       └ bots/expirações
```

## Monorepo e aplicações

| Área       | Implementação                    | Evidência                             |
| ---------- | -------------------------------- | ------------------------------------- |
| Workspaces | pnpm 11.5.1 + Turbo 2.10.5       | `package.json`, `pnpm-workspace.yaml` |
| Linguagem  | TypeScript 6 strict              | `packages/tsconfig/`                  |
| Runtime    | Node >=20.9; CI Node 24          | manifests e workflow                  |
| API        | NestJS 11, Fastify 5, REST/WS    | `apps/api`                            |
| Web        | Next.js 16, React 19, App Router | `apps/web`                            |
| Mobile     | Expo 57, RN 0.86, Expo Router    | `apps/mobile`                         |
| Worker     | Node, PostgreSQL, Redis, BullMQ  | `apps/worker`                         |

Pacotes: `chess-domain`, `rating-domain`, `contracts` Zod, `sdk`, `eslint-config` e `tsconfig`. Os domínios de xadrez/rating não dependem de Nest nem banco, decisão que deve ser preservada.

## API e contratos

A API configura prefixo `/v1`, CORS por `WEB_ORIGIN`, body limit de 2 MiB, shutdown hooks, Problem Details e WebSocket em `bootstrap.ts`. Módulos ativos:

- identidade: auth, users e admin;
- jogo: games, matchmaking e ratings;
- aprendizagem: courses, lesson-runtime, exercises e learning-path;
- social: social, messages, feed e safety;
- comercial: subscriptions e referrals;
- plataforma: settings, AI providers, storage, Redis, database e observability.

O padrão é controller → service → repository; games/matchmaking/ratings explicitam camadas de aplicação, domínio, infraestrutura e apresentação.

`api/openapi.yaml` usa OpenAPI 3.1, enquanto `@xadrez/contracts` contém schemas Zod compartilhados e o SDK gera tipos. `ARQ-01 — ALTO`: seis rotas `/learning-path/*` e live narration existem em controllers/contracts, mas não no OpenAPI. Consumidores gerados recebem contrato incompleto. Recomendação: paridade controller/contrato/OpenAPI como gate de CI.

## Dados e persistência

PostgreSQL 17.10 é a fonte de verdade. Há 40 migrations up/down, checksum SHA-256 e rollback da última migration. A CI aplica banco limpo, conteúdo, e2e, backup/restore e rollback/reapply.

O acesso é híbrido: Drizzle tipa sobretudo identidade; `postgres.js` parametrizado atende a maioria dos repositories. `DatabaseService` mantém conexões separadas para evitar interferência dos parsers Drizzle e define JSON/JSONB explicitamente.

`ARQ-02 — MÉDIO`: duas query layers e schema Drizzle parcial aumentam risco de divergência. A separação atual é correta; unificação ampla exigiria autorização.

Todos os números possuem rollback, mas alguns perdem chaves de IA, pagamentos, badges ou metadados. Backup pré-migration deve prevalecer quando dados primários seriam descartados.

Redis 7.4/AOF atende relay, bots e BullMQ. MinIO armazena avatars/fotos com limites de 512 KiB/2 MiB e bucket público de leitura.

## Partidas e realtime

- WebSocket `/v1/ws`, protocolo versionado e payload máximo de 16 KiB.
- PostgreSQL decide legalidade, relógio, versão e resultado sob lock/transação.
- `clientMoveId` e `expectedVersion` sustentam idempotência e concorrência otimista.
- Redis pub/sub retransmite eventos entre instâncias; sem Redis, entrega local continua.
- Worker revalida partidas expiradas a cada 15 s como backstop dos timers.
- Snapshot, versão e replay permitem reconexão sem confiar no cliente.

## Worker e engines

| Rotina               | Intervalo | Responsabilidade          |
| -------------------- | --------: | ------------------------- |
| Autoaceite de bots   |      10 s | Pedidos configurados      |
| Timeout de partidas  |      15 s | Relógios duráveis         |
| Fila de bots         |      30 s | Matchmaking               |
| Análise              |      30 s | Stockfish pós-partida     |
| Presença             |      60 s | Disponibilidade de bots   |
| Narração             |      60 s | LLM sobre fatos do engine |
| Assinaturas vencidas |    10 min | Estado comercial          |

Stockfish roda localmente em subprocesso isolado por avaliação e percorre plies sequencialmente. O LLM não escolhe lances: apenas transforma análise calculada em texto. BullMQ existe, mas o worker `system` é mínimo; as rotinas reais usam polling.

`ARQ-03 — MÉDIO`: uma réplica funciona com o Compose atual, mas múltiplos workers podem executar os mesmos polls. Antes de escalar, cada job deve provar claim atômico, lock ou idempotência. Migrar tudo para BullMQ não é automaticamente superior.

`ARQ-04 — MÉDIO`: um subprocesso Stockfish por posição favorece isolamento, mas cobra inicialização por ply. Profundidade, MultiPV e paralelismo exigem medição de throughput.

## Segurança e autorização

- Argon2 para senhas; JWT access padrão de 15 min e refresh de 30 dias.
- Refresh rotativo, sessões persistidas e revogação/reuse detection.
- Guards de autenticação, admin e entitlements; limites validados no servidor.
- Zod, queries parametrizadas, Problem Details e segredos obrigatórios em produção.
- Headers de segurança, request ID, logs estruturados e rate limiting.
- WebSocket limita autenticação, comandos, salas, conexões e payload.
- Privacidade, bloqueios, denúncias e audit logs possuem módulos próprios.

`ARQ-05 — ALTO`: web armazena access e refresh tokens em `localStorage`. Isso evita CSRF de cookie, mas amplia o impacto de XSS, principalmente sobre o refresh longo. Mobile usa `SecureStore`. Trocar o transporte exige plano próprio; primeiro devem ser auditados CSP/headers do HTML e vetores de conteúdo.

`ARQ-06 — MÉDIO`: rate limiter HTTP usa `Map` por processo. Réplicas multiplicam o limite e reinícios zeram janelas. Redis é candidato natural, desde que exista fallback testado.

`ARQ-07 — MÉDIO`: headers estão confirmados na API, mas `next.config.ts` não os define para HTML e o Traefik só confirma TLS/roteamento. O estado dos headers web permanece `UNKNOWN` até teste da resposta real.

## Web, mobile e design system

Web usa Next App Router, cliente HTTP central e WebSocket/SDK. Estado global é leve, com Context para preferências; telas mantêm estado local. Há tokens CSS, componentes `ui`, CSS modules, breakpoints, `dvh`, focus-visible, ARIA, anúncios de movimento e reduced motion.

`ARQ-08 — BAIXO/MÉDIO`: o design system é real, mas pragmático; CSS global extenso e módulos locais podem divergir. Não há justificativa para substituí-lo antes da auditoria visual.

Mobile usa Expo Router, `SecureStore`, contratos/SDK, realtime e tabuleiro nativo. Fluxos localizados: login, jogar, cursos/aulas, social e perfil.

`ARQ-09 — MÉDIO`: mobile é subconjunto do web e possui 3 arquivos de teste, contra 18 web e 42 API. A CI não produz build Android/iOS assinado; paridade e prontidão de loja não podem ser presumidas.

## Observabilidade, testes e analytics

- Prometheus em `/v1/metrics`, logs JSON com request/trace ID e OpenTelemetry opcional.
- Health checks de API, worker e web; deploy executa carga básica.
- Audit logs persistem ações sensíveis.
- 92 arquivos de teste: API 42, web 18, mobile 3, worker 12, chess-domain 4, contracts 10, rating 1 e SDK 2.
- 23 arquivos e2e; CI cobre banco limpo, importação, jornadas, backup/restore e rollback/reapply.

`ARQ-10 — MÉDIO`: não foi encontrada pipeline dedicada de product analytics para o funil Jogar → Analisar → Treinar → Jogar. Métricas operacionais não substituem analytics de produto; confirmação cabe à `T20-A12`.

## CI, deploy e operação

A CI possui três jobs:

1. `quality`: Compose dev, format, lint, typecheck, testes e build;
2. `container-validation`: Compose de produção, imagens e usuário não-root;
3. `database-integration`: migrations, conteúdo, e2e, carga, backup/restore e rollback.

Deploy usa exclusivamente Git: timer, `flock`, worktree limpa e `git pull --ff-only`. Imagens recebem tag do commit; há backup antes das migrations, importação estrita, health checks e carga. Traefik redireciona para HTTPS com Let's Encrypt.

`ARQ-11 — ALTO`: `auto-deploy.sh` implanta qualquer novo commit em `origin/main` sem verificar GitHub Actions. Uma CI vermelha pode chegar à produção. Recomendação: promover apenas commit aprovado por status, tag/release ou referência separada, mantendo Git pull.

`ARQ-12 — MÉDIO`: falha de health não faz rollback automático de código/schema. O marcador não avança e existe backup, mas recuperação exige forward-fix ou operação. Rollback automático de schema seria pior porque várias migrations documentam perda de dados.

## Matriz de maturidade

| Área                        | Estado                                       | Confiança  |
| --------------------------- | -------------------------------------------- | ---------- |
| Separação frontend/backend  | Maduro                                       | Alta       |
| Autoridade de partidas      | Maduro                                       | Alta       |
| Realtime                    | Maduro com degradação conhecida              | Alta       |
| Banco/migrations            | Maduro; rollback pode perder derivados/dados | Alta       |
| Contratos                   | Parcial por drift do OpenAPI                 | Alta       |
| Worker/análise              | Funcional; escala não provada                | Alta       |
| Segurança API               | Boa base                                     | Alta       |
| Segurança web               | Parcial/UNKNOWN                              | Média      |
| Observabilidade operacional | Boa base                                     | Alta       |
| Product analytics           | Não confirmado                               | Média      |
| Web/acessibilidade          | Boa base                                     | Média/alta |
| Mobile/release              | Parcial                                      | Alta       |
| CI                          | Forte                                        | Alta       |
| Deploy                      | Funcional com risco de CI                    | Alta       |

## Decisões a preservar

1. PostgreSQL autoritativo e clientes não confiáveis.
2. `clientMoveId`, versão e reconstrução da partida.
3. Domínios de xadrez/rating independentes do framework.
4. API `/v1`, Zod, Problem Details e SDK.
5. Relay Redis com entrega local imediata.
6. Stockfish produz fatos; LLM apenas narra.
7. Migrations pareadas, backup e perdas documentadas.
8. Deploy exclusivamente por Git pull.
9. Design existente até ganho de UX ser demonstrado.

## Gates de autorização

Exigem autorização antes de implementação: trocar frameworks, PostgreSQL, Redis, MinIO, BullMQ ou Stockfish; mudar o transporte de autenticação; unificar query layers por reescrita ampla; migrar toda a infraestrutura de jobs; automatizar rollback destrutivo; substituir navegação/design system maduros.

Podem ser planejados sem autorização, por serem melhorias compatíveis: corrigir OpenAPI, adicionar gate de CI ao deploy, testar headers web, medir Stockfish, ampliar testes mobile e projetar rate limit distribuído com fallback.

## Próxima auditoria

`T20-A03 — Jogar, partidas, histórico e realtime`: aprofundar comandos, idempotência, relógios, resultados, rating, PGN/FEN, histórico, revisão, bots e sinais produzidos para o ciclo central.
