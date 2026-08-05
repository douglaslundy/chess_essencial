#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${XADREZ_BACKUP_DIR:-$ROOT_DIR/.deploy/backups}"
BACKUP_FILE="${1:-}"
RESTIC_TAG="${XADREZ_RESTIC_TAG:-xadrez-postgres}"
RESTIC_HOST="${XADREZ_RESTIC_HOST:-xadrez-production}"
ARCHIVE_NAME="xadrez-postgres-backup.tar"
KEEP_DAILY="${XADREZ_RESTIC_KEEP_DAILY:-14}"
KEEP_WEEKLY="${XADREZ_RESTIC_KEEP_WEEKLY:-8}"
KEEP_MONTHLY="${XADREZ_RESTIC_KEEP_MONTHLY:-12}"

if [[ -z "$BACKUP_FILE" ]]; then
  printf '%s\n' 'Usage: bash deploy/offsite-backup.sh <backup.dump>' >&2
  exit 2
fi

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required for offsite backups}"
if [[ -z "${RESTIC_PASSWORD:-}" && -z "${RESTIC_PASSWORD_FILE:-}" && -z "${RESTIC_PASSWORD_COMMAND:-}" ]]; then
  printf '%s\n' 'offsite_backup.status=failed reason=restic_password_not_configured' >&2
  exit 2
fi

if [[ "${XADREZ_ALLOW_LOCAL_RESTIC_REPOSITORY:-false}" != "true" ]]; then
  case "$RESTIC_REPOSITORY" in
    s3:* | b2:* | azure:* | gs:* | swift:* | rclone:* | rest:* | sftp:*) ;;
    *)
      printf '%s\n' 'offsite_backup.status=failed reason=repository_not_remote' >&2
      exit 2
      ;;
  esac
fi

command -v restic >/dev/null || {
  printf '%s\n' 'offsite_backup.status=failed reason=restic_not_installed' >&2
  exit 127
}
command -v tar >/dev/null || {
  printf '%s\n' 'offsite_backup.status=failed reason=tar_not_installed' >&2
  exit 127
}
for value in "$KEEP_DAILY" "$KEEP_WEEKLY" "$KEEP_MONTHLY"; do
  [[ "$value" =~ ^[1-9][0-9]*$ ]] || {
    printf '%s\n' 'offsite_backup.status=failed reason=invalid_retention' >&2
    exit 2
  }
done

backup_root="$(realpath "$BACKUP_DIR")"
backup_file="$(realpath "$BACKUP_FILE")"
[[ "$backup_file" == "$backup_root"/* ]] || {
  printf '%s\n' 'offsite_backup.status=failed reason=backup_outside_root' >&2
  exit 2
}
test -s "$backup_file"
test -s "$backup_file.sha256"

backup_name="$(basename "$backup_file")"
checksum_name="$backup_name.sha256"
archive_file="$(mktemp "$BACKUP_DIR/.offsite-backup.XXXXXX.tar")"
cleanup() { rm -f -- "$archive_file"; }
trap cleanup EXIT
chmod 600 "$archive_file"
(
  cd "$(dirname "$backup_file")"
  sha256sum --check "$checksum_name" >/dev/null
  tar --create --file "$archive_file" "$backup_name" "$checksum_name"
)
test -s "$archive_file"

restic backup \
  --host "$RESTIC_HOST" \
  --tag "$RESTIC_TAG" \
  --stdin \
  --stdin-filename "$ARCHIVE_NAME" <"$archive_file"

restic forget \
  --host "$RESTIC_HOST" \
  --tag "$RESTIC_TAG" \
  --keep-daily "$KEEP_DAILY" \
  --keep-weekly "$KEEP_WEEKLY" \
  --keep-monthly "$KEEP_MONTHLY" \
  --prune

printf '%s\n' \
  'offsite_backup.status=ok' \
  "offsite_backup.file=$backup_name" \
  "offsite_backup.retention=daily:$KEEP_DAILY,weekly:$KEEP_WEEKLY,monthly:$KEEP_MONTHLY"
