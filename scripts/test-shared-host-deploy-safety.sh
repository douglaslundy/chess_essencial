#!/usr/bin/env bash
set -Eeuo pipefail

deploy_script="deploy/remote-deploy.sh"

grep --quiet 'PROJECT_NAME="xadrez-essencial"' "$deploy_script"
grep --quiet 'docker compose --project-name "$PROJECT_NAME"' "$deploy_script"
grep --quiet 'XADREZ_MIN_FREE_DISK_KB' "$deploy_script"
grep --quiet 'ONE_TIME_LOCAL_BACKUP_CEILING="0043_game_learning_signals.up.sql"' "$deploy_script"
grep --quiet 'XADREZ_BACKUP_MODE=local-only bash deploy/backup-database.sh' "$deploy_script"
grep --quiet 'bash deploy/backup-database.sh' "$deploy_script"
grep --quiet 'BACKUP_MODE="${XADREZ_BACKUP_MODE:-offsite}"' deploy/backup-database.sh

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
