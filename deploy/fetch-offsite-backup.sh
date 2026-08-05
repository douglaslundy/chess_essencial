#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${XADREZ_BACKUP_DIR:-$ROOT_DIR/.deploy/backups}"
RESTIC_TAG="${XADREZ_RESTIC_TAG:-xadrez-postgres}"
RESTIC_HOST="${XADREZ_RESTIC_HOST:-xadrez-production}"
ARCHIVE_NAME="xadrez-postgres-backup.tar"
SNAPSHOT="${1:-latest}"
TARGET_DIR="${2:-$BACKUP_DIR/offsite-restore-$(date --utc +%Y%m%dT%H%M%SZ)}"

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required to fetch offsite backups}"
if [[ -z "${RESTIC_PASSWORD:-}" && -z "${RESTIC_PASSWORD_FILE:-}" && -z "${RESTIC_PASSWORD_COMMAND:-}" ]]; then
  printf '%s\n' 'offsite_restore.status=failed reason=restic_password_not_configured' >&2
  exit 2
fi

if [[ "${XADREZ_ALLOW_LOCAL_RESTIC_REPOSITORY:-false}" != "true" ]]; then
  case "$RESTIC_REPOSITORY" in
    s3:* | b2:* | azure:* | gs:* | swift:* | rclone:* | rest:* | sftp:*) ;;
    *)
      printf '%s\n' 'offsite_restore.status=failed reason=repository_not_remote' >&2
      exit 2
      ;;
  esac
fi

command -v restic >/dev/null || {
  printf '%s\n' 'offsite_restore.status=failed reason=restic_not_installed' >&2
  exit 127
}
command -v tar >/dev/null || {
  printf '%s\n' 'offsite_restore.status=failed reason=tar_not_installed' >&2
  exit 127
}
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

backup_root="$(realpath "$BACKUP_DIR")"
target_dir="$(realpath --canonicalize-missing "$TARGET_DIR")"
[[ "$target_dir" == "$backup_root"/* ]] || {
  printf '%s\n' 'offsite_restore.status=failed reason=target_outside_backup_root' >&2
  exit 2
}
mkdir -p "$target_dir"
chmod 700 "$target_dir"
if find "$target_dir" -mindepth 1 -print -quit | grep --quiet .; then
  printf '%s\n' 'offsite_restore.status=failed reason=target_not_empty' >&2
  exit 2
fi

restic dump \
  --host "$RESTIC_HOST" \
  --tag "$RESTIC_TAG" \
  "$SNAPSHOT" "$ARCHIVE_NAME" | tar --extract --directory "$target_dir"

mapfile -t backup_files < <(find "$target_dir" -maxdepth 1 -type f -name 'chess-*.dump' -print)
[[ "${#backup_files[@]}" -eq 1 ]] || {
  printf '%s\n' 'offsite_restore.status=failed reason=unexpected_backup_count' >&2
  exit 1
}

backup_file="${backup_files[0]}"
checksum_name="$(basename "$backup_file").sha256"
(
  cd "$target_dir"
  sha256sum --check "$checksum_name" >/dev/null
)
chmod 600 "$backup_file" "$backup_file.sha256"

printf '%s\n' \
  'offsite_restore.status=ok' \
  "offsite_restore.snapshot=$SNAPSHOT" \
  "offsite_restore.file=$backup_file"
