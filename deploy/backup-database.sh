#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${XADREZ_ENV_FILE:-$ROOT_DIR/.env.vps}"
COMPOSE_FILE="$ROOT_DIR/deploy/docker-compose.vps.yml"
PROJECT_NAME="xadrez-essencial"
BACKUP_DIR="${XADREZ_BACKUP_DIR:-$ROOT_DIR/.deploy/backups}"
RETENTION_DAYS="${XADREZ_BACKUP_RETENTION_DAYS:-14}"
BACKUP_MODE="${XADREZ_BACKUP_MODE:-offsite}"

test -f "$ENV_FILE"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

set -a
source "$ENV_FILE"
set +a

timestamp="$(date --utc +%Y%m%dT%H%M%SZ)"
backup_file="$BACKUP_DIR/chess-$timestamp.dump"
temporary_file="$backup_file.partial"

cleanup() { rm -f "$temporary_file"; }
trap cleanup EXIT

docker compose --project-name "$PROJECT_NAME" --file "$COMPOSE_FILE" --env-file "$ENV_FILE" \
  exec --no-TTY postgres pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --format=custom --no-owner --no-acl >"$temporary_file"

test -s "$temporary_file"
mv "$temporary_file" "$backup_file"
(
  cd "$BACKUP_DIR"
  sha256sum "$(basename "$backup_file")" >"$(basename "$backup_file").sha256"
)
chmod 600 "$backup_file" "$backup_file.sha256"
case "$BACKUP_MODE" in
  offsite)
    bash "$ROOT_DIR/deploy/offsite-backup.sh" "$backup_file"
    ;;
  local-only)
    printf '%s\n' 'backup.offsite=skipped reason=explicit_one_time_user_authorization'
    ;;
  *)
    printf '%s\n' "backup.status=failed reason=invalid_backup_mode mode=$BACKUP_MODE" >&2
    exit 2
    ;;
esac
find "$BACKUP_DIR" -type f -mtime "+$RETENTION_DAYS" -name 'chess-*.dump*' -delete

printf '%s\n' "backup.status=ok" "backup.mode=$BACKUP_MODE" "backup.file=$backup_file"
