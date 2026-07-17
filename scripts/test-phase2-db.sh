#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

set -a
source .env.vps
set +a

DATABASE_NAME="chess_phase2_test"
COMPOSE=(docker compose --project-name xadrez-essencial --file deploy/docker-compose.vps.yml --env-file .env.vps)
POSTGRES_CONTAINER="xadrez-essencial-postgres-1"
TEST_DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${DATABASE_NAME}"

cleanup() {
  docker exec "$POSTGRES_CONTAINER"     psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres     -c "DROP DATABASE IF EXISTS ${DATABASE_NAME} WITH (FORCE);" >/dev/null
}
trap cleanup EXIT

cleanup
docker exec "$POSTGRES_CONTAINER"   psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres   -c "CREATE DATABASE ${DATABASE_NAME};" >/dev/null

"${COMPOSE[@]}" run --rm   -e DATABASE_URL="$TEST_DATABASE_URL"   -e NODE_ENV=test   api pnpm --filter @xadrez/api db:migrate

"${COMPOSE[@]}" run --rm   -e DATABASE_URL="$TEST_DATABASE_URL"   -e NODE_ENV=test   api pnpm --filter @xadrez/api db:seed

"${COMPOSE[@]}" run --rm   -e DATABASE_URL="$TEST_DATABASE_URL"   -e NODE_ENV=test   -e RUN_DB_TESTS=true   -e AUTH_EXPOSE_VERIFICATION_TOKEN=true   api pnpm --filter @xadrez/api exec vitest run src/auth/auth.e2e.test.ts src/games/games.e2e.test.ts src/games/realtime.e2e.test.ts src/matchmaking/matchmaking-rating.e2e.test.ts

"${COMPOSE[@]}" run --rm   -e DATABASE_URL="$TEST_DATABASE_URL"   -e NODE_ENV=test   api pnpm --filter @xadrez/api db:rollback

rollback_result="$(
  docker exec "$POSTGRES_CONTAINER"     psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$DATABASE_NAME"     -tAc "SELECT to_regclass('public.game_review_annotations') IS NULL AND to_regclass('public.game_draw_offers') IS NOT NULL;"
)"
[[ "$rollback_result" == "t" ]]
printf '%s\n' 'migration.rollback_verified=true'

"${COMPOSE[@]}" run --rm   -e DATABASE_URL="$TEST_DATABASE_URL"   -e NODE_ENV=test   api pnpm --filter @xadrez/api db:migrate

"${COMPOSE[@]}" run --rm   -e DATABASE_URL="$TEST_DATABASE_URL"   -e NODE_ENV=test   api pnpm --filter @xadrez/api db:seed

seed_count="$(
  docker exec "$POSTGRES_CONTAINER"     psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$DATABASE_NAME"     -tAc 'SELECT count(*) FROM game_time_controls;'
)"
[[ "$seed_count" == "7" ]]
printf '%s\n' 'migration.reapply_verified=true'
printf '%s\n' 'seed.time_controls_verified=7'
