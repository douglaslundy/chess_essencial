#!/usr/bin/env bash
set -Eeuo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work_dir="$(mktemp -d)"
backup_file="$work_dir/chess-ci.dump"
restore_database="chess_restore_${RANDOM}_${RANDOM}"
pg_container="${PG_CONTAINER:-}"

cleanup() {
  if [[ -n "$pg_container" ]]; then
    docker exec "$pg_container" dropdb --username "${PGUSER:-chess}" --if-exists --force "$restore_database" >/dev/null 2>&1 || true
  else
    dropdb --if-exists --force --maintenance-db="$DATABASE_URL" "$restore_database" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$work_dir"
}
trap cleanup EXIT

if [[ -n "$pg_container" ]]; then
  pg_user="${PGUSER:-chess}"
  pg_database="${PGDATABASE:-chess}"
  docker exec "$pg_container" pg_dump --username "$pg_user" --dbname "$pg_database" \
    --format=custom --no-owner --no-acl >"$backup_file"
else
  pg_dump --format=custom --no-owner --no-acl --file="$backup_file" "$DATABASE_URL"
fi

test -s "$backup_file"
(
  cd "$work_dir"
  sha256sum "$(basename "$backup_file")" >"$(basename "$backup_file").sha256"
)

if [[ "${VERIFY_OFFSITE_BACKUP:-false}" == "true" ]]; then
  command -v restic >/dev/null
  password_file="$work_dir/restic-password"
  wrong_password_file="$work_dir/restic-wrong-password"
  printf '%s\n' 'ci-only-restic-recovery-password' >"$password_file"
  printf '%s\n' 'incorrect-ci-password' >"$wrong_password_file"
  chmod 600 "$password_file" "$wrong_password_file"

  export RESTIC_REPOSITORY="$work_dir/restic-repository"
  export RESTIC_PASSWORD_FILE="$password_file"
  export XADREZ_BACKUP_DIR="$work_dir"
  export XADREZ_RESTIC_HOST=xadrez-ci
  export XADREZ_RESTIC_KEEP_DAILY=2
  export XADREZ_RESTIC_KEEP_WEEKLY=2
  export XADREZ_RESTIC_KEEP_MONTHLY=2

  local_guard_log="$work_dir/local-repository-guard.log"
  if bash "$ROOT_DIR/deploy/offsite-backup.sh" "$backup_file" >"$local_guard_log" 2>&1; then
    printf '%s\n' 'backup_restore.status=failed reason=local_repository_was_accepted' >&2
    exit 1
  fi
  grep --quiet 'reason=repository_not_remote' "$local_guard_log"
  export XADREZ_ALLOW_LOCAL_RESTIC_REPOSITORY=true

  restic init --quiet

  if env -u RESTIC_PASSWORD -u RESTIC_PASSWORD_FILE -u RESTIC_PASSWORD_COMMAND \
    bash "$ROOT_DIR/deploy/offsite-backup.sh" "$backup_file" >/dev/null 2>&1; then
    printf '%s\n' 'backup_restore.status=failed reason=missing_password_was_accepted' >&2
    exit 1
  fi

  guard_file="$work_dir/chess-corrupted.dump"
  cp "$backup_file" "$guard_file"
  (
    cd "$work_dir"
    sha256sum "$(basename "$guard_file")" >"$(basename "$guard_file").sha256"
  )
  printf '%s\n' 'corruption-after-checksum' >>"$guard_file"
  if bash "$ROOT_DIR/deploy/offsite-backup.sh" "$guard_file" >/dev/null 2>&1; then
    printf '%s\n' 'backup_restore.status=failed reason=corrupt_dump_was_uploaded' >&2
    exit 1
  fi
  rm -f -- "$guard_file" "$guard_file.sha256"

  bash "$ROOT_DIR/deploy/offsite-backup.sh" "$backup_file"
  restic check --read-data

  if RESTIC_PASSWORD_FILE="$wrong_password_file" restic snapshots >/dev/null 2>&1; then
    printf '%s\n' 'backup_restore.status=failed reason=repository_accepted_wrong_password' >&2
    exit 1
  fi

  rm -f -- "$backup_file" "$backup_file.sha256"
  recovered_dir="$work_dir/recovered"
  bash "$ROOT_DIR/deploy/fetch-offsite-backup.sh" latest "$recovered_dir"
  mapfile -t recovered_files < <(find "$recovered_dir" -maxdepth 1 -type f -name 'chess-*.dump' -print)
  [[ "${#recovered_files[@]}" -eq 1 ]]
  backup_file="${recovered_files[0]}"
fi

if [[ -n "$pg_container" ]]; then
  docker exec "$pg_container" createdb --username "$pg_user" "$restore_database"
  docker exec --interactive "$pg_container" pg_restore --username "$pg_user" \
    --dbname "$restore_database" --no-owner --no-acl <"$backup_file"
  source_counts="$(docker exec "$pg_container" psql --username "$pg_user" --dbname "$pg_database" \
    --tuples-only --no-align --command="SELECT (SELECT count(*) FROM _xadrez_migrations) || ':' || (SELECT count(*) FROM game_time_controls) || ':' || (SELECT count(*) FROM courses);")"
  restore_counts="$(docker exec "$pg_container" psql --username "$pg_user" --dbname "$restore_database" \
    --tuples-only --no-align --command="SELECT (SELECT count(*) FROM _xadrez_migrations) || ':' || (SELECT count(*) FROM game_time_controls) || ':' || (SELECT count(*) FROM courses);")"
else
  createdb --maintenance-db="$DATABASE_URL" "$restore_database"
  pg_restore --no-owner --no-acl --dbname="${DATABASE_URL%/*}/$restore_database" "$backup_file"
  source_counts="$(psql "$DATABASE_URL" --tuples-only --no-align --command="SELECT (SELECT count(*) FROM _xadrez_migrations) || ':' || (SELECT count(*) FROM game_time_controls) || ':' || (SELECT count(*) FROM courses);")"
  restore_counts="$(psql "${DATABASE_URL%/*}/$restore_database" --tuples-only --no-align --command="SELECT (SELECT count(*) FROM _xadrez_migrations) || ':' || (SELECT count(*) FROM game_time_controls) || ':' || (SELECT count(*) FROM courses);")"
fi

test "$source_counts" = "$restore_counts"
printf '%s\n' \
  'backup_restore.status=ok' \
  "backup_restore.offsite=${VERIFY_OFFSITE_BACKUP:-false}" \
  "backup_restore.counts=$restore_counts"
