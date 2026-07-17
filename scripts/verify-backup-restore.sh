#!/usr/bin/env bash
set -Eeuo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

backup_file="$(mktemp --suffix=.dump)"
restore_database="chess_restore_${RANDOM}_${RANDOM}"
pg_container="${PG_CONTAINER:-}"

cleanup() {
  if [[ -n "$pg_container" ]]; then
    docker exec "$pg_container" dropdb --username "${PGUSER:-chess}" --if-exists --force "$restore_database" >/dev/null 2>&1 || true
  else
    dropdb --if-exists --force --maintenance-db="$DATABASE_URL" "$restore_database" >/dev/null 2>&1 || true
  fi
  rm -f "$backup_file"
}
trap cleanup EXIT

if [[ -n "$pg_container" ]]; then
  pg_user="${PGUSER:-chess}"
  pg_database="${PGDATABASE:-chess}"
  docker exec "$pg_container" pg_dump --username "$pg_user" --dbname "$pg_database" \
    --format=custom --no-owner --no-acl >"$backup_file"
  docker exec "$pg_container" createdb --username "$pg_user" "$restore_database"
  docker exec --interactive "$pg_container" pg_restore --username "$pg_user" \
    --dbname "$restore_database" --no-owner --no-acl <"$backup_file"
  source_counts="$(docker exec "$pg_container" psql --username "$pg_user" --dbname "$pg_database" \
    --tuples-only --no-align --command="SELECT (SELECT count(*) FROM schema_migrations) || ':' || (SELECT count(*) FROM game_time_controls) || ':' || (SELECT count(*) FROM courses);")"
  restore_counts="$(docker exec "$pg_container" psql --username "$pg_user" --dbname "$restore_database" \
    --tuples-only --no-align --command="SELECT (SELECT count(*) FROM schema_migrations) || ':' || (SELECT count(*) FROM game_time_controls) || ':' || (SELECT count(*) FROM courses);")"
else
  pg_dump --format=custom --no-owner --no-acl --file="$backup_file" "$DATABASE_URL"
  createdb --maintenance-db="$DATABASE_URL" "$restore_database"
  pg_restore --no-owner --no-acl --dbname="${DATABASE_URL%/*}/$restore_database" "$backup_file"
  source_counts="$(psql "$DATABASE_URL" --tuples-only --no-align --command="SELECT (SELECT count(*) FROM schema_migrations) || ':' || (SELECT count(*) FROM game_time_controls) || ':' || (SELECT count(*) FROM courses);")"
  restore_counts="$(psql "${DATABASE_URL%/*}/$restore_database" --tuples-only --no-align --command="SELECT (SELECT count(*) FROM schema_migrations) || ':' || (SELECT count(*) FROM game_time_controls) || ':' || (SELECT count(*) FROM courses);")"
fi

test "$source_counts" = "$restore_counts"
printf '%s\n' "backup_restore.status=ok" "backup_restore.counts=$restore_counts"
