#!/usr/bin/env bash
set -Eeuo pipefail

deploy_script="deploy/remote-deploy.sh"

grep --quiet 'PROJECT_NAME="xadrez-essencial"' "$deploy_script"
grep --quiet 'docker compose --project-name "$PROJECT_NAME"' "$deploy_script"
grep --quiet 'XADREZ_MIN_FREE_DISK_KB' "$deploy_script"

for repository in xadrez-api xadrez-worker xadrez-web; do
  grep --quiet "$repository" "$deploy_script"
done

if grep --extended-regexp --quiet \
  'docker (system prune|builder prune|volume prune|image prune)|compose.*down.*(--volumes|-v)' \
  "$deploy_script"; then
  printf '%s\n' 'deploy isolation check found a global or volume-destructive Docker cleanup'
  exit 1
fi

printf '%s\n' 'shared-host deploy isolation checks passed'
