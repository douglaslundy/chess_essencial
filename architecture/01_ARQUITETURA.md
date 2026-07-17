# Arquitetura de referência

## Estratégia
Começar como **monólito modular distribuível**: um backend NestJS único, com módulos bem isolados, uma aplicação Next.js e workers separados. Essa abordagem reduz complexidade operacional no MVP e permite extração futura de serviços.

## Monorepo

```text
apps/
  web/                 # Next.js
  api/                 # NestJS/Fastify REST + WebSocket
  worker/              # BullMQ: rating, análise, e-mail, importação
  admin/               # opcional, Next.js ou rota protegida do web
packages/
  api-client/          # cliente gerado do OpenAPI
  chess-domain/        # tipos, regras e utilitários sem I/O
  contracts/           # schemas Zod/JSON Schema, eventos
  design-system/       # tokens e componentes
  eslint-config/
  tsconfig/
infra/
  docker/
  terraform/
  monitoring/
docs/
```

## Módulos do backend

- `auth`: cadastro, login, refresh, verificação, recuperação.
- `users`: perfis, preferências, bloqueios.
- `matchmaking`: filas e desafios diretos.
- `games`: estado, lances, relógio, resultados, reconexão.
- `ratings`: cálculo e ledger.
- `history`: consultas, PGN, replay.
- `courses`: cursos, módulos, aulas, etapas.
- `lesson-runtime`: máquina de estados interativa.
- `exercises`: importação e tentativa.
- `content-admin`: edição e publicação.
- `notifications`: e-mail, push futuro.
- `moderation`: denúncias, sanções, chat opcional.
- `anti-cheat`: sinais e revisão; não bloquear automaticamente no MVP.
- `analytics`: eventos de produto.

## Fluxo de partida

1. Cliente autentica e entra em fila.
2. Matchmaking cria `game` com snapshot de rating e configuração.
3. Ambos entram em sala WebSocket autenticada.
4. Servidor inicia relógio e emite estado.
5. Cliente propõe `move.submit` com `clientMoveId` e UCI.
6. Servidor valida turno, versão do estado, legalidade e relógio.
7. Em transação: persiste lance, atualiza game e registra outbox.
8. Publica `game.move_committed` para sala.
9. Ao terminar, persiste resultado e agenda atualização de rating.
10. Rating grava duas entradas imutáveis no ledger.

## Consistência

- `game.version` aumenta a cada transição.
- `clientMoveId` único por jogador/partida garante idempotência.
- Lock otimista + transação serializável ou advisory lock por game.
- Relógio calculado no servidor por timestamps monotônicos.
- Redis serve para presença, salas e coordenação; PostgreSQL é fonte de verdade.

## Escala futura

- Extrair `game-server` para serviço próprio por shard.
- Particionar jogos por `game_id` e data.
- Usar Redis Cluster para presença e filas.
- Event bus Kafka/NATS quando volume justificar.
- CDN para assets e conteúdo estático.
