#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${XADREZ_ENV_FILE:-$ROOT_DIR/.env.vps}"
COMPOSE_FILE="$ROOT_DIR/deploy/docker-compose.vps.yml"
PROJECT_NAME="xadrez-essencial"
BACKUP_DIR="${XADREZ_BACKUP_DIR:-$ROOT_DIR/.deploy/backups}"
backup_file="${1:-}"

if [[ -z "$backup_file" || "${RESTORE_CONFIRM:-}" != "replace-$PROJECT_NAME-database" ]]; then
  printf '%s\n' "Usage: RESTORE_CONFIRM=replace-$PROJECT_NAME-database bash deploy/restore-database.sh <backup.dump>" >&2
  exit 2
fi

backup_file="$(realpath "$backup_file")"
backup_root="$(realpath "$BACKUP_DIR")"
[[ "$backup_file" == "$backup_root"/* ]]
test -s "$backup_file"
(
  cd "$(dirname "$backup_file")"
  sha256sum --check "$(basename "$backup_file").sha256"
)
test -f "$ENV_FILE"

set -a
source "$ENV_FILE"
set +a

compose=(docker compose --project-name "$PROJECT_NAME" --file "$COMPOSE_FILE" --env-file "$ENV_FILE")
"${compose[@]}" stop api worker web
"${compose[@]}" exec --no-TTY postgres psql --username "$POSTGRES_USER" --dbname postgres \
  --set ON_ERROR_STOP=1 --command "DROP DATABASE IF EXISTS \"$POSTGRES_DB\" WITH (FORCE);"
"${compose[@]}" exec --no-TTY postgres psql --username "$POSTGRES_USER" --dbname postgres \
  --set ON_ERROR_STOP=1 --command "CREATE DATABASE \"$POSTGRES_DB\";"
"${compose[@]}" exec --no-TTY postgres pg_restore --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" --no-owner --no-acl <"$backup_file"
"${compose[@]}" up --detach api worker web

printf '%s\n' "restore.status=ok" "restore.file=$backup_file"
