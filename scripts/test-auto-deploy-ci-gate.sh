#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
ORIGIN="$TMP_DIR/origin.git"
SEED="$TMP_DIR/seed"
TARGET="$TMP_DIR/target"
MARKER="$TMP_DIR/deploy-marker"
trap 'rm -rf -- "$TMP_DIR"' EXIT

if ! command -v flock >/dev/null 2>&1; then
  mkdir -p "$TMP_DIR/bin"
  cat >"$TMP_DIR/bin/flock" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  chmod +x "$TMP_DIR/bin/flock"
  export PATH="$TMP_DIR/bin:$PATH"
fi

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

assert_equals() {
  local expected="$1"
  local actual="$2"
  local message="$3"
  [[ "$actual" == "$expected" ]] || fail "$message (expected=$expected actual=$actual)"
}

git init --quiet --bare "$ORIGIN"
git init --quiet --initial-branch=main "$SEED"
git -C "$SEED" config user.email test@example.com
git -C "$SEED" config user.name 'Deploy gate test'
printf 'first\n' >"$SEED/release.txt"
git -C "$SEED" add release.txt
git -C "$SEED" commit --quiet --message first
git -C "$SEED" remote add origin "$ORIGIN"
git -C "$SEED" push --quiet --set-upstream origin main
first_commit="$(git -C "$SEED" rev-parse HEAD)"

git clone --quiet --branch main "$ORIGIN" "$TARGET"
mkdir -p "$TARGET/deploy"
cat >"$TARGET/deploy/remote-deploy.sh" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
git rev-parse HEAD >>"$TEST_DEPLOY_MARKER"
EOF

run_gate() {
  TEST_DEPLOY_MARKER="$MARKER" \
    XADREZ_ROOT_DIR="$TARGET" \
    XADREZ_DEPLOY_BRANCH=main \
    XADREZ_APPROVED_BRANCH=deploy/approved \
    bash "$REPO_ROOT/deploy/auto-deploy.sh"
}

run_gate
[[ ! -e "$MARKER" ]] || fail 'deploy ran without an approval ref'
grep --quiet 'auto_deploy.blocked=approval_ref_unavailable' \
  "$TARGET/.deploy/auto-deploy.log" || fail 'missing unavailable approval log'

git -C "$SEED" push --quiet origin main:deploy/approved
run_gate
assert_equals "$first_commit" "$(tail -n 1 "$MARKER")" \
  'approved first commit was not deployed'
assert_equals "$first_commit" "$(cat "$TARGET/.deploy/last-successful-commit")" \
  'successful marker did not advance after deploy'

printf 'second\n' >>"$SEED/release.txt"
git -C "$SEED" add release.txt
git -C "$SEED" commit --quiet --message second
git -C "$SEED" push --quiet origin main
second_commit="$(git -C "$SEED" rev-parse HEAD)"
run_gate
assert_equals 1 "$(wc -l <"$MARKER" | tr -d ' ')" \
  'unapproved second commit triggered deploy'
assert_equals "$first_commit" "$(git -C "$TARGET" rev-parse HEAD)" \
  'working tree advanced before approval'
grep --quiet "auto_deploy.blocked=ci_not_approved remote=$second_commit approved=$first_commit" \
  "$TARGET/.deploy/auto-deploy.log" || fail 'missing CI-not-approved log'

git -C "$SEED" push --quiet origin main:deploy/approved
run_gate
assert_equals "$second_commit" "$(tail -n 1 "$MARKER")" \
  'second commit did not deploy after approval'
assert_equals "$second_commit" "$(cat "$TARGET/.deploy/last-successful-commit")" \
  'successful marker did not advance to the second commit'

printf 'auto-deploy CI gate tests passed\n'
