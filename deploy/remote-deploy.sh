#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${XADREZ_ENV_FILE:-$ROOT_DIR/.env.vps}"
COMPOSE_FILE="$ROOT_DIR/deploy/docker-compose.vps.yml"
# Optional Traefik overlay: when present (and the external `proxy` network
# exists) it joins web/api to the shared reverse proxy. Kept in the compose set
# for every command so auto-deploys never drop the HTTPS routing.
OVERLAY_FILE="$ROOT_DIR/deploy/docker-compose.traefik.yml"
PROJECT_NAME="xadrez-essencial"
IMAGE_TAG="$(git rev-parse --short=12 HEAD)"
export IMAGE_TAG

if [[ ! -f "$ENV_FILE" ]]; then
  umask 077
  db_password="$(openssl rand -hex 24)"
  cat >"$ENV_FILE" <<EOF
POSTGRES_DB=chess
POSTGRES_USER=chess
POSTGRES_PASSWORD=$db_password
WEB_PORT=3100
API_PORT=4100
WORKER_PORT=4101
MAILPIT_SMTP_PORT=1026
MAILPIT_UI_PORT=8026
PUBLIC_API_URL=http://localhost:4100/v1
WEB_ORIGIN=http://localhost:3100
AUTH_EXPOSE_VERIFICATION_TOKEN=false
DEMO_SEED_ENABLED=false
EOF
fi

append_secret_if_missing() {
  local name="$1"
  if ! grep --quiet "^${name}=" "$ENV_FILE"; then
    printf '%s=%s\n' "$name" "$(openssl rand -hex 32)" >>"$ENV_FILE"
  fi
}

append_value_if_missing() {
  local name="$1"
  local value="$2"
  if ! grep --quiet "^${name}=" "$ENV_FILE"; then
    printf '%s=%s\n' "$name" "$value" >>"$ENV_FILE"
  fi
}

append_value_if_missing AUTH_EXPOSE_VERIFICATION_TOKEN false
append_value_if_missing DEMO_SEED_ENABLED false
append_value_if_missing BOT_PERSONAS_ENABLED false
append_secret_if_missing AUTH_ACCESS_SECRET
append_secret_if_missing AUTH_REFRESH_SECRET
append_secret_if_missing AUTH_VERIFICATION_SECRET
append_secret_if_missing AUTH_IP_HASH_SECRET
append_secret_if_missing METRICS_TOKEN

set -a
source "$ENV_FILE"
set +a

compose=(docker compose --project-name "$PROJECT_NAME" --file "$COMPOSE_FILE")
if [[ -f "$OVERLAY_FILE" ]] && docker network inspect proxy >/dev/null 2>&1; then
  compose+=(--file "$OVERLAY_FILE")
fi
compose+=(--env-file "$ENV_FILE")
"${compose[@]}" config >/dev/null

remove_old_release_tags() {
  for repo in xadrez-api xadrez-worker xadrez-web; do
    docker images "$repo" --format '{{.Repository}}:{{.Tag}}' \
      | grep -v ":$IMAGE_TAG$" \
      | xargs --no-run-if-empty docker rmi --force >/dev/null 2>&1 || true
  done
}

# Failed releases never reach the post-deploy cleanup, so remove their old
# xadrez-only tags before building as well. Images referenced by running
# containers remain available even after their stale tag is removed.
remove_old_release_tags
docker image prune --force >/dev/null 2>&1 || true
docker builder prune --force --filter "until=24h" >/dev/null 2>&1 || true

docker build --file "$ROOT_DIR/deploy/Dockerfile" --target api \
  --build-arg "NEXT_PUBLIC_API_URL=$PUBLIC_API_URL" --tag "xadrez-api:$IMAGE_TAG" "$ROOT_DIR"
docker build --file "$ROOT_DIR/deploy/Dockerfile" --target worker \
  --build-arg "NEXT_PUBLIC_API_URL=$PUBLIC_API_URL" --tag "xadrez-worker:$IMAGE_TAG" "$ROOT_DIR"
docker build --file "$ROOT_DIR/deploy/Dockerfile" --target web \
  --build-arg "NEXT_PUBLIC_API_URL=$PUBLIC_API_URL" --tag "xadrez-web:$IMAGE_TAG" "$ROOT_DIR"

"${compose[@]}" up --detach --wait --wait-timeout 120 postgres redis mailpit

schema_exists="$("${compose[@]}" exec --no-TTY postgres psql --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" --tuples-only --no-align \
  --command "SELECT to_regclass('public._xadrez_migrations') IS NOT NULL;")"
if [[ "$schema_exists" == "t" ]]; then
  bash deploy/backup-database.sh
fi

"${compose[@]}" run --rm api pnpm content:validate
"${compose[@]}" run --rm api pnpm --filter @xadrez/api db:migrate
"${compose[@]}" run --rm api pnpm --filter @xadrez/api db:seed
"${compose[@]}" run --rm api pnpm --filter @xadrez/api db:import-exercises database/content/Xadrez_Essencial_Exercicios_1_a_1298.json --strict
"${compose[@]}" run --rm api pnpm --filter @xadrez/api db:import-lessons database/content/Xadrez_Essencial_Aulas_1_a_119.json --strict --publish

if [[ "${DEMO_SEED_ENABLED:-false}" == "true" ]]; then
  : "${DEMO_USER_PASSWORD:?DEMO_USER_PASSWORD is required when demo seed is enabled}"
  "${compose[@]}" run --rm --env DEMO_SEED_ENABLED=true --env DEMO_USER_PASSWORD \
    api pnpm --filter @xadrez/api db:seed-demo
fi

if [[ "${BOT_PERSONAS_ENABLED:-false}" == "true" ]]; then
  "${compose[@]}" run --rm --env BOT_PERSONAS_ENABLED=true --env BOT_PERSONAS_COUNT \
    api pnpm --filter @xadrez/api db:seed-bot-personas
fi

"${compose[@]}" up --detach --remove-orphans

wait_for_url() {
  local name="$1"
  local url="$2"
  local attempts=60

  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if curl --fail --silent --show-error "$url" >/dev/null; then
      printf '%s\n' "health.$name=ok"
      return 0
    fi
    sleep 2
  done

  printf '%s\n' "health.$name=failed"
  return 1
}

wait_for_url api "http://127.0.0.1:$API_PORT/v1/health"
wait_for_url worker "http://127.0.0.1:$WORKER_PORT/health"
wait_for_url web "http://127.0.0.1:$WEB_PORT/api/health"
wait_for_url course "http://127.0.0.1:$API_PORT/v1/courses/xadrez-essencial"

"${compose[@]}" exec --no-TTY \
  --env LOAD_TEST_URL=http://127.0.0.1:4000/v1/health \
  --env LOAD_TEST_REQUESTS=40 --env LOAD_TEST_CONCURRENCY=8 \
  api node scripts/basic-load.mjs

"${compose[@]}" ps
printf '%s\n' "release.image_tag=$IMAGE_TAG"

# Drop any superseded release tags after the new containers are healthy.
remove_old_release_tags
