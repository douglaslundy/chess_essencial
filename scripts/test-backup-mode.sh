#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_DIR"' EXIT

mkdir -p "$TEST_DIR/deploy" "$TEST_DIR/bin" "$TEST_DIR/backups"
cp "$ROOT_DIR/deploy/backup-database.sh" "$TEST_DIR/deploy/backup-database.sh"

cat >"$TEST_DIR/.env.vps" <<'EOF'
POSTGRES_USER=xadrez
POSTGRES_DB=xadrez
EOF

cat >"$TEST_DIR/bin/docker" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' 'portable-postgres-dump'
EOF
chmod +x "$TEST_DIR/bin/docker"

cat >"$TEST_DIR/deploy/offsite-backup.sh" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$1" >"$(dirname "${BASH_SOURCE[0]}")/../offsite-called"
EOF
chmod +x "$TEST_DIR/deploy/offsite-backup.sh"

common_env=(
  env
  "PATH=$TEST_DIR/bin:$PATH"
  "XADREZ_ENV_FILE=$TEST_DIR/.env.vps"
  "XADREZ_BACKUP_DIR=$TEST_DIR/backups"
)

XADREZ_BACKUP_MODE=local-only "${common_env[@]}" bash "$TEST_DIR/deploy/backup-database.sh"
test ! -e "$TEST_DIR/offsite-called"
test "$(find "$TEST_DIR/backups" -name 'chess-*.dump' | wc -l)" -eq 1
test "$(find "$TEST_DIR/backups" -name 'chess-*.dump.sha256' | wc -l)" -eq 1

"${common_env[@]}" bash "$TEST_DIR/deploy/backup-database.sh"
test -s "$TEST_DIR/offsite-called"

if XADREZ_BACKUP_MODE=invalid "${common_env[@]}" bash "$TEST_DIR/deploy/backup-database.sh"; then
  printf '%s\n' 'invalid backup mode unexpectedly succeeded' >&2
  exit 1
fi

printf '%s\n' 'backup mode tests passed'
