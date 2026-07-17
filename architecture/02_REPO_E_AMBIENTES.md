# Repositório, ambientes e configuração

## Pacotes

```text
pnpm-workspace.yaml
apps/web
apps/api
apps/worker
packages/chess-domain
packages/contracts
packages/api-client
packages/design-system
```

## Ambientes

- local: Docker Compose.
- test: banco efêmero por suíte.
- staging: réplica funcional, dados sintéticos.
- production: alta disponibilidade conforme demanda.

## Variáveis principais

```dotenv
NODE_ENV=development
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
COOKIE_DOMAIN=localhost
WEB_ORIGIN=http://localhost:3000
API_ORIGIN=http://localhost:4000
S3_ENDPOINT=...
S3_BUCKET=...
SMTP_URL=...
OTEL_EXPORTER_OTLP_ENDPOINT=...
```

## Branches e CI

- trunk-based ou PR curto.
- CI: install, lint, typecheck, migrations check, tests, build, image scan.
- Preview por PR para frontend; API de preview opcional.
