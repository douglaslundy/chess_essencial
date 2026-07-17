# ADRs resumidos

## ADR-001 — Backend NestJS + Fastify
Aceito por modularidade, TypeScript end-to-end, WebSocket, validação, DI e produtividade com Codex. Fastify reduz overhead HTTP.

## ADR-002 — PostgreSQL como fonte de verdade
Adequado para transações, integridade, consultas históricas, JSONB e particionamento.

## ADR-003 — Redis não é fonte de verdade
Redis guarda presença, filas, rate limits e cache. Partidas confirmadas precisam estar no PostgreSQL.

## ADR-004 — Servidor autoritativo
Cliente apenas propõe ações. Evita fraude trivial, inconsistência de relógio e divergência de regras.

## ADR-005 — Rating FIDE-style interno
Implementar metodologia configurável por pool. Não declarar homologação FIDE.

## ADR-006 — SAN, UCI, FEN e PGN
Guardar UCI como comando canônico, SAN para apresentação, FEN após cada ply para replay rápido, PGN gerado/armazenado ao concluir.

## ADR-007 — Curso como máquina de estados
Cada etapa contém posição, instrução, ações aceitas, feedback e transições. Permite aulas interativas e branches.
