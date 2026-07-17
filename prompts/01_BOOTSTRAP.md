# Fase 1 — Bootstrap do monorepo

Crie o monorepo com `apps/web`, `apps/api`, `apps/worker` e pacotes compartilhados. Configure pnpm, Turborepo, TypeScript strict, ESLint, Prettier, env validation e Docker Compose com PostgreSQL/Redis/Mailpit. Fixe versões estáveis atuais e gere README de execução.

Critérios:
- `pnpm install`, `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test` funcionam.
- health checks no web e API.
- CI inicial.
