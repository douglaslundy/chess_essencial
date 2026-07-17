# Xadrez Essencial

Monorepo da plataforma Xadrez Essencial: frontend e backend separados, partidas de xadrez com servidor autoritativo, rating por ritmo, histórico, curso interativo e exercícios.

As Fases 1–12 entregam a plataforma executável e o deploy automatizado. O estado auditado, os gates atuais e o backlog V2 estão em `docs/PHASE13_AUDIT.md` e `TAREFAS.md`.

## Stack da Fase 1

- pnpm 11 e Turborepo;
- Next.js 16 com App Router;
- NestJS 11 com Fastify;
- worker BullMQ;
- TypeScript strict;
- PostgreSQL 17, Redis 7 e Mailpit via Docker Compose;
- ESLint, Prettier e Vitest.

As versões e decisões de compatibilidade estão em `docs/COMPATIBILITY_MATRIX.md`.

## Fase 2 — banco e autenticação

A API agora inclui migrations SQL transacionais, Drizzle ORM para identidade, seed idempotente
e os fluxos de cadastro, entrega e reenvio de verificação por SMTP, login, refresh rotativo, logout e perfil.

```bash
pnpm --filter @xadrez/api db:migrate
pnpm --filter @xadrez/api db:seed
pnpm --filter @xadrez/api db:rollback
```

O rollback de `0001_base` remove todas as tabelas e deve ser usado apenas em ambiente
controlado. Em produção, os quatro segredos `AUTH_*_SECRET` são obrigatórios. O token de
verificação só é devolvido pela API quando `AUTH_EXPOSE_VERIFICATION_TOKEN=true`, destinado
à confirmação automatizada em testes locais. Com o token oculto, a mensagem é entregue pelo SMTP configurado.

Endpoints entregues nesta fase: `/v1/auth/register`, `/v1/auth/resend-verification`, `/v1/auth/verify`,
`/v1/auth/login`, `/v1/auth/refresh`, `/v1/auth/logout`, `GET /v1/me` e
`PATCH /v1/me`. Erros HTTP seguem `application/problem+json`.

## Fase 3 — domínio de xadrez

O pacote `@xadrez/chess-domain` encapsula o adapter `chess.js` e não depende de NestJS
ou banco. Ele valida UCI, deriva SAN/FEN/PGN e detecta mate, stalemate, repetição, regra
dos 50 lances e material insuficiente.

A API permite criar partidas e confirmar lances via REST. Cada comando usa `clientMoveId`
e `expectedVersion`; o servidor reconstrói o histórico, valida turno e legalidade e persiste
lance, novo estado e outbox na mesma transação. FEN, relógio e resultado enviados pelo
cliente são ignorados pelos contratos.

## Pré-requisitos

- Node.js 20.9 ou superior; Node.js 24 é usado na CI;
- pnpm 11;
- Docker com Docker Compose para a infraestrutura local.

## Início rápido

No PowerShell:

```powershell
Copy-Item .env.example .env
pnpm install
docker compose up -d
pnpm dev
```

Serviços locais:

| Serviço          | Endereço                         |
| ---------------- | -------------------------------- |
| Web              | http://localhost:3000            |
| Health do web    | http://localhost:3000/api/health |
| API              | http://localhost:4000/v1         |
| Health da API    | http://localhost:4000/v1/health  |
| Health do worker | http://localhost:4001/health     |
| Mailpit          | http://localhost:8025            |
| PostgreSQL       | localhost:5432                   |
| Redis            | localhost:6379                   |

O worker depende do Redis. Inicie o Compose antes de executar `pnpm dev`.

## Scripts

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

Os scripts da raiz são orquestrados pelo Turborepo. Para executar uma aplicação isolada:

```bash
pnpm --filter @xadrez/web dev
pnpm --filter @xadrez/api dev
pnpm --filter @xadrez/worker dev
```

## Infraestrutura local

```bash
docker compose up -d
docker compose ps
docker compose down
```

Os dados do PostgreSQL e Redis usam volumes nomeados. O arquivo `.env.example` contém somente credenciais locais de desenvolvimento e não deve ser reutilizado em produção.

## Estrutura

```text
apps/
  web/            Next.js e health route
  api/            NestJS/Fastify, API /v1
  worker/         BullMQ e health server
packages/
  contracts/      contratos compartilhados
  eslint-config/  configuração de lint
  tsconfig/       configurações TypeScript strict
docs/
  COMPATIBILITY_MATRIX.md
  REALTIME_PROTOCOL.md
  MATCHMAKING_RATING.md
  DEPLOY_GIT_PULL.md
```

Os documentos de arquitetura e domínio continuam nas pastas `architecture/`, `database/`, `realtime/`, `rating/`, `course/`, `security/` e `testing/`.

## Regras fundamentais

- O servidor é autoritativo para regras, relógio, resultado e rating.
- O cliente nunca é fonte confiável de FEN, tempo restante ou resultado.
- APIs são versionadas em `/v1`.
- O rating interno é chamado de Rating Xadrez Essencial ou rating FIDE-style, nunca de rating oficial FIDE.
- Frontend e backend não compartilham acesso direto ao banco.

## Ordem de implementação

1. Bootstrap do monorepo.
2. Banco e autenticação.
3. Domínio de xadrez.
4. Tempo real e relógios.
5. Matchmaking e rating.
6. Interface de jogo.
7. Histórico e revisão.
8. Curso e CMS.
9. Aula interativa.
10. Exercícios.
11. Segurança e observabilidade.
12. Homologação e release.

Nenhuma fase deve avançar antes de cumprir seus próprios critérios e testes.
