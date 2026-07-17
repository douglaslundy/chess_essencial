# Módulos NestJS

```text
src/
  main.ts
  app.module.ts
  common/
  auth/
  users/
  games/
    domain/
    application/
    infrastructure/
    presentation/
  matchmaking/
  ratings/
  courses/
  lesson-runtime/
  exercises/
  notifications/
  moderation/
  analytics/
```

## Hexagonal pragmática

Para módulos críticos (`games`, `ratings`, `lesson-runtime`):
- domain: entidades, value objects, políticas;
- application: commands, queries, ports;
- infrastructure: PostgreSQL, Redis, jobs;
- presentation: REST/WS.

## Bibliotecas sugeridas

- validação: Zod ou class-validator; preferir contratos Zod compartilháveis.
- chess rules: chess.js ou equivalente, encapsulado.
- auth: Argon2id, JWT curto + refresh rotativo.
- rate limiting: Redis.
- serialization: OpenAPI gerado.
