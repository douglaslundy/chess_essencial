#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="$ROOT_DIR/.env.vps"
COMPOSE_FILE="$ROOT_DIR/deploy/docker-compose.vps.yml"
PROJECT_NAME="xadrez-essencial"

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
PUBLIC_API_URL=http://192.168.0.233:4100/v1
WEB_ORIGIN=http://192.168.0.233:3100
AUTH_EXPOSE_VERIFICATION_TOKEN=false
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

append_secret_if_missing AUTH_ACCESS_SECRET
append_secret_if_missing AUTH_REFRESH_SECRET
append_secret_if_missing AUTH_VERIFICATION_SECRET
append_secret_if_missing AUTH_IP_HASH_SECRET
append_secret_if_missing METRICS_TOKEN

set -a
source "$ENV_FILE"
set +a

docker compose --project-name "$PROJECT_NAME" --file "$COMPOSE_FILE" --env-file "$ENV_FILE" config >/dev/null
docker build   --file "$ROOT_DIR/deploy/Dockerfile"   --build-arg "NEXT_PUBLIC_API_URL=$PUBLIC_API_URL"   --tag xadrez-essencial:phase5   "$ROOT_DIR"

docker compose   --project-name "$PROJECT_NAME"   --file "$COMPOSE_FILE"   --env-file "$ENV_FILE"   up --detach postgres redis mailpit

docker compose   --project-name "$PROJECT_NAME"   --file "$COMPOSE_FILE"   --env-file "$ENV_FILE"   run --rm api pnpm --filter @xadrez/api db:migrate

docker compose   --project-name "$PROJECT_NAME"   --file "$COMPOSE_FILE"   --env-file "$ENV_FILE"   run --rm api pnpm --filter @xadrez/api db:seed

docker compose   --project-name "$PROJECT_NAME"   --file "$COMPOSE_FILE"   --env-file "$ENV_FILE"   up --detach --remove-orphans

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

docker compose --project-name "$PROJECT_NAME" --file "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
