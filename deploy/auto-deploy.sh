#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="${XADREZ_ROOT_DIR:-/home/lundy/xadrez-essencial}"
BRANCH="${XADREZ_DEPLOY_BRANCH:-main}"
APPROVED_BRANCH="${XADREZ_APPROVED_BRANCH:-deploy/approved}"
STATE_DIR="$ROOT_DIR/.deploy"
SUCCESS_FILE="$STATE_DIR/last-successful-commit"
LOG_FILE="$STATE_DIR/auto-deploy.log"

mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/auto-deploy.lock"
flock --nonblock 9 || exit 0
exec >>"$LOG_FILE" 2>&1

printf '%s auto_deploy.check\n' "$(date --iso-8601=seconds)"
cd "$ROOT_DIR"

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  printf '%s auto_deploy.blocked=tracked_changes\n' "$(date --iso-8601=seconds)"
  exit 1
fi

git fetch --quiet origin \
  "refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
remote_commit="$(git rev-parse "refs/remotes/origin/$BRANCH")"

if ! git fetch --quiet origin \
  "refs/heads/$APPROVED_BRANCH:refs/remotes/origin/$APPROVED_BRANCH"; then
  printf '%s auto_deploy.blocked=approval_ref_unavailable remote=%s ref=%s\n' \
    "$(date --iso-8601=seconds)" "$remote_commit" "$APPROVED_BRANCH"
  exit 0
fi

approved_commit="$(git rev-parse "refs/remotes/origin/$APPROVED_BRANCH")"
if [[ "$remote_commit" != "$approved_commit" ]]; then
  printf '%s auto_deploy.blocked=ci_not_approved remote=%s approved=%s\n' \
    "$(date --iso-8601=seconds)" "$remote_commit" "$approved_commit"
  exit 0
fi

successful_commit="$(cat "$SUCCESS_FILE" 2>/dev/null || true)"
if [[ "$remote_commit" == "$successful_commit" ]]; then
  printf '%s auto_deploy.no_change=%s\n' "$(date --iso-8601=seconds)" "$remote_commit"
  exit 0
fi

git checkout --quiet "$BRANCH"
git pull --ff-only origin "$BRANCH"
bash deploy/remote-deploy.sh
printf '%s\n' "$remote_commit" >"$SUCCESS_FILE"
printf '%s auto_deploy.success=%s\n' "$(date --iso-8601=seconds)" "$remote_commit"
