# Implantação

## MVP recomendado

- Web: Vercel ou container.
- API/Worker: Fly.io, Render, Railway, ECS, Kubernetes ou plataforma de containers.
- PostgreSQL gerenciado.
- Redis gerenciado.
- S3 compatível.

## Docker Compose local

Serviços:
- postgres;
- redis;
- api;
- worker;
- web;
- mailpit;
- prometheus/grafana opcional.

## Produção

- TLS obrigatório;
- migrations como job único;
- readiness/liveness;
- backup diário + PITR;
- restore test trimestral;
- rolling deploy;
- sticky sessions apenas se adapter WS exigir; preferir Redis adapter.

## Observabilidade

- trace por `correlationId`;
- métricas: active_games, move_latency, ws_connections, queue_wait, rating_jobs_failed;
- alertas por erro, latência e backlog.
